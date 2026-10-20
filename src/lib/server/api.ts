import { z } from 'zod'
import { auth, requireUser } from './auth'
import { database } from './db'
import { runtime, budgetFor } from './runtime'
import {
  assertOrigin,
  chinaDay,
  errorResponse,
  HttpError,
  readJson,
} from './http'
import { decrypt, encrypt, sameSecret } from './crypto'
import { discoverModels, normalizeBaseUrl, testProvider } from './provider'
import { chat } from './chat'
import { readDocument, searchKnowledge } from './knowledge'
import { providerInput } from '../shared'
import { learningContent } from '../learning-content'

const uuid = z.string().uuid()
const providerProbe = providerInput.extend({
  modelId: z.string().min(1).max(200).optional(),
})
const audit = (
  actorId: string,
  action: string,
  targetId: string | null,
  details: unknown,
) =>
  database().auditLog.create({
    data: {
      id: crypto.randomUUID(),
      actorId,
      action,
      targetId,
      details: JSON.stringify(details),
      createdAt: new Date().toISOString(),
    },
  })
const publicProvider = (row: {
  id: string
  name: string
  protocol: string
  baseUrl: string
  models: string
  enabled: boolean
  maxOutputTokens: number
  keyPreview: string
}) => ({
  id: row.id,
  name: row.name,
  protocol: row.protocol,
  baseUrl: row.baseUrl,
  models: JSON.parse(row.models),
  enabled: row.enabled,
  maxOutputTokens: row.maxOutputTokens,
  keyPreview: row.keyPreview,
})

export async function api(request: Request) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  try {
    assertOrigin(request)
    return await route(request)
  } catch (error) {
    return errorResponse(error, requestId)
  }
}

async function route(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api/, '')
  const { env } = runtime()
  const db = database()
  const ip = request.headers.get('cf-connecting-ip') ?? 'local'
  const ipBudget = budgetFor(`ip:${ip}`)
  if (path === '/health') return Response.json({ ok: true, service: 'kaogong' })
  if (path === '/setup' && request.method === 'POST') {
    if (
      !(await sameSecret(
        request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '',
        env.BOOTSTRAP_TOKEN,
      ))
    )
      throw new HttpError(403, 'FORBIDDEN', '无权初始化')
    if (await db.user.count({ where: { role: 'admin' } }))
      throw new HttpError(409, 'ALREADY_INITIALIZED', '管理员已经初始化')
    const body = await readJson(
      request,
      z.object({
        email: z.string().email(),
        password: z.string().min(16).max(128),
        name: z.string().min(1).max(50),
      }),
    )
    const result = await auth().api.signUpEmail({ body })
    await db.user.update({
      where: { id: result.user.id },
      data: { role: 'admin', emailVerified: true },
    })
    await db.appSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update: {},
    })
    await audit(result.user.id, 'ADMIN_INITIALIZED', result.user.id, {})
    return Response.json({ ok: true, email: body.email })
  }
  if (path.startsWith('/auth/')) {
    if (!(await ipBudget.rate(path.includes('sign-up') ? 5 : 30)))
      throw new HttpError(429, 'RATE_LIMITED', '操作太频繁，请一分钟后再试')
    if (path.includes('/sign-up')) {
      const settings = await db.appSettings.findUnique({
        where: { id: 'global' },
      })
      if (
        !settings?.registrationEnabled ||
        !(await db.user.count({ where: { role: 'admin' } }))
      )
        throw new HttpError(
          403,
          'REGISTRATION_CLOSED',
          '注册暂未开放，请稍后再试',
        )
      const lease = `signup:${crypto.randomUUID()}`
      const signupBudget = budgetFor(`signup:${ip}`)
      if (!(await signupBudget.reserve(lease, 1, 5)))
        throw new HttpError(429, 'SIGNUP_LIMIT', '该网络今日注册次数已达上限')
      try {
        const response = await auth().handler(request)
        await signupBudget.settle(lease, response.ok ? 1 : 0)
        return response
      } catch (error) {
        await signupBudget.settle(lease, 0)
        throw error
      }
    }
    return auth().handler(request)
  }
  const user = await requireUser(request, path.startsWith('/admin/'))
  const budget = budgetFor(`user:${user.id}`)
  if (
    !path.startsWith('/knowledge/assets/') &&
    !(await budget.rate(user.requestsPerMinute))
  )
    throw new HttpError(
      429,
      'RATE_LIMITED',
      `每分钟最多 ${user.requestsPerMinute} 次接口调用，请稍后再试`,
    )
  if (path === '/me')
    return Response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        dailyTokenLimit: user.dailyTokenLimit,
        requestsPerMinute: user.requestsPerMinute,
      },
      budget: await budget.snapshot(
        user.dailyTokenLimit,
        user.requestsPerMinute,
      ),
    })
  if (path === '/models') {
    const [providers, settings] = await Promise.all([
      db.provider.findMany({
        where: { enabled: true },
        orderBy: { name: 'asc' },
      }),
      db.appSettings.findUnique({ where: { id: 'global' } }),
    ])
    return Response.json({
      providers: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        models: JSON.parse(provider.models) as string[],
      })),
      defaultProviderId: settings?.defaultProviderId,
      defaultModelId: settings?.defaultModelId,
    })
  }
  if (path === '/conversations' && request.method === 'GET')
    return Response.json(
      await db.conversation.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    )
  if (path === '/conversations' && request.method === 'POST') {
    const { title } = await readJson(
      request,
      z.object({
        title: z.string().trim().min(1).max(80).default('新的学习对话'),
      }),
    )
    const now = new Date().toISOString()
    return Response.json(
      await db.conversation.create({
        data: {
          id: crypto.randomUUID(),
          title,
          userId: user.id,
          createdAt: now,
          updatedAt: now,
        },
      }),
      { status: 201 },
    )
  }
  const conversationMatch = path.match(/^\/conversations\/([^/]+)$/)
  if (conversationMatch && request.method === 'GET') {
    const id = uuid.parse(conversationMatch[1])
    const conversation = await db.conversation.findFirst({
      where: { id, userId: user.id },
    })
    if (!conversation) throw new HttpError(404, 'NOT_FOUND', '对话不存在')
    const messages = await db.message.findMany({
      where: { conversationId: id, userId: user.id },
      orderBy: { createdAt: 'asc' },
      take: 300,
    })
    return Response.json({
      ...conversation,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: learningContent(message.content),
      })),
    })
  }
  if (path === '/chat' && request.method === 'POST') return chat(request, user)
  if (path === '/usage') {
    const events = await db.usageEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return Response.json({
      budget: await budget.snapshot(
        user.dailyTokenLimit,
        user.requestsPerMinute,
      ),
      events,
    })
  }
  if (path === '/knowledge/modules') {
    const results = await env.DB.prepare(
      "SELECT module, COUNT(*) AS count FROM KnowledgeDocument WHERE kind IN ('lecture','topic','question','material') GROUP BY module ORDER BY count DESC",
    ).all()
    return Response.json(results.results)
  }
  if (path === '/knowledge/documents') {
    const params = z
      .object({
        q: z.string().max(120).default(''),
        module: z.string().max(80).optional(),
        page: z.coerce.number().int().min(1).max(1000).default(1),
      })
      .parse(Object.fromEntries(url.searchParams))
    if (params.q)
      return Response.json({
        items: await searchKnowledge(params.q, params.module, 30),
        page: 1,
      })
    const where = params.module ? ' AND module = ?' : ''
    const results = await env.DB.prepare(
      `SELECT id, title, module, kind, issue FROM KnowledgeDocument WHERE kind IN ('lecture','topic','question','material')${where} ORDER BY CASE WHEN kind='lecture' THEN 0 WHEN kind='topic' THEN 1 ELSE 2 END, title LIMIT 30 OFFSET ?`,
    )
      .bind(...(params.module ? [params.module] : []), (params.page - 1) * 30)
      .all()
    return Response.json({
      items: results.results.map((item) => ({
        ...item,
        title: learningContent(String(item.title)),
      })),
      page: params.page,
    })
  }
  const documentMatch = path.match(/^\/knowledge\/documents\/([a-f0-9]{24})$/)
  if (documentMatch)
    return Response.json(await readDocument(documentMatch[1], 0, 2_000_000))
  const assetMatch = path.match(/^\/knowledge\/assets\/([a-f0-9]{24})$/)
  if (assetMatch) {
    const asset = await env.DB.prepare(
      'SELECT * FROM KnowledgeAsset WHERE id = ?',
    )
      .bind(assetMatch[1])
      .first<{ offset: number; length: number; contentType: string }>()
    if (!asset || !asset.contentType.startsWith('image/'))
      throw new HttpError(404, 'NOT_FOUND', '图片不存在')
    const object = await env.KNOWLEDGE.get('content.pack', {
      range: { offset: asset.offset, length: asset.length },
    })
    if (!object)
      throw new HttpError(503, 'KNOWLEDGE_NOT_READY', '知识库资源尚未同步')
    return new Response(object.body, {
      headers: {
        'Content-Type': asset.contentType,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
  if (path === '/admin/providers' && request.method === 'GET')
    return Response.json(
      (await db.provider.findMany({ orderBy: { createdAt: 'asc' } })).map(
        publicProvider,
      ),
    )
  if (path.startsWith('/admin/providers') && request.method === 'POST') {
    const body = await readJson(request, providerProbe)
    const existing = body.id
      ? await db.provider.findUnique({ where: { id: body.id } })
      : null
    if (body.id && !existing)
      throw new HttpError(404, 'NOT_FOUND', 'Provider 不存在')
    const apiKey =
      body.apiKey?.trim() ||
      (existing ? await decrypt(existing.encryptedKey) : '')
    if (!apiKey) throw new HttpError(400, 'MISSING_KEY', '请填写 API 密钥')
    const baseUrl = normalizeBaseUrl(body.baseUrl)
    const config = { ...body, baseUrl }
    if (path.endsWith('/discover'))
      return Response.json({
        models: await discoverModels(
          config,
          apiKey,
          `provider:${user.id}:${body.id ?? 'new'}`,
        ),
      })
    if (path.endsWith('/test')) {
      if (!body.modelId)
        throw new HttpError(400, 'MISSING_MODEL', '请先选择一个模型')
      const lease = `probe:${crypto.randomUUID()}`
      if (
        !(await budget.reserve(
          lease,
          body.maxOutputTokens + 4096,
          user.dailyTokenLimit,
        ))
      )
        throw new HttpError(
          429,
          'DAILY_QUOTA_EXCEEDED',
          '今日剩余额度不足以测试',
        )
      const started = Date.now()
      try {
        const result = await testProvider(
          config,
          apiKey,
          body.modelId,
          `provider:${user.id}:${body.id ?? 'new'}`,
        )
        const input = result.usage.inputTokens ?? 0,
          output = result.usage.outputTokens ?? 0
        const charge = await budget.settle(
          lease,
          result.usage.totalTokens ?? (input + output || null),
        )
        await db.usageEvent.create({
          data: {
            id: lease,
            userId: user.id,
            providerId: body.id,
            modelId: body.modelId,
            day: chinaDay(),
            inputTokens: input,
            outputTokens: output,
            totalTokens: charge,
            status: 'test_success',
            latencyMs: Date.now() - started,
            createdAt: new Date().toISOString(),
          },
        })
        return Response.json(result)
      } catch {
        await budget.settle(lease, 0)
        throw new HttpError(
          502,
          'PROVIDER_TEST_FAILED',
          '测试失败，请检查地址、协议、密钥及模型是否支持当前输出设置',
        )
      }
    }
    if (path !== '/admin/providers')
      throw new HttpError(404, 'NOT_FOUND', '接口不存在')
    const now = new Date().toISOString()
    const data = {
      name: body.name,
      protocol: body.protocol,
      baseUrl,
      encryptedKey: await encrypt(apiKey),
      keyPreview: `••••${apiKey.slice(-4)}`,
      models: JSON.stringify(body.models),
      enabled: body.enabled,
      maxOutputTokens: body.maxOutputTokens,
      updatedAt: now,
    }
    const result = await db.provider.upsert({
      where: { id: body.id ?? crypto.randomUUID() },
      create: { id: body.id ?? crypto.randomUUID(), ...data, createdAt: now },
      update: data,
    })
    await audit(user.id, 'PROVIDER_SAVED', result.id, {
      name: result.name,
      protocol: result.protocol,
      modelCount: body.models.length,
    })
    return Response.json(publicProvider(result))
  }
  if (path === '/admin/settings' && request.method === 'GET')
    return Response.json(
      await db.appSettings.findUnique({ where: { id: 'global' } }),
    )
  if (path === '/admin/settings' && request.method === 'PATCH') {
    const body = await readJson(
      request,
      z.object({
        defaultProviderId: z.string().uuid().nullable(),
        defaultModelId: z.string().max(200).nullable(),
        registrationEnabled: z.boolean(),
      }),
    )
    if (body.defaultProviderId) {
      const provider = await db.provider.findUnique({
        where: { id: body.defaultProviderId },
      })
      if (
        !provider?.enabled ||
        !JSON.parse(provider.models).includes(body.defaultModelId)
      )
        throw new HttpError(
          400,
          'MODEL_NOT_AVAILABLE',
          '默认模型必须来自已启用 Provider 的模型列表',
        )
    }
    const settings = await db.appSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...body },
      update: body,
    })
    await audit(user.id, 'SETTINGS_UPDATED', null, body)
    return Response.json(settings)
  }
  if (path === '/admin/users' && request.method === 'GET') {
    const query = z
      .object({
        q: z.string().max(100).default(''),
        page: z.coerce.number().int().min(1).max(1000).default(1),
      })
      .parse(Object.fromEntries(url.searchParams))
    const where = query.q
      ? {
          OR: [
            { email: { contains: query.q } },
            { name: { contains: query.q } },
          ],
        }
      : {}
    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * 25,
        take: 25,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          banned: true,
          dailyTokenLimit: true,
          requestsPerMinute: true,
          createdAt: true,
        },
      }),
      db.user.count({ where }),
    ])
    return Response.json({
      total,
      page: query.page,
      users: await Promise.all(
        users.map(async (row) => ({
          ...row,
          budget: await budgetFor(`user:${row.id}`).snapshot(
            row.dailyTokenLimit,
            row.requestsPerMinute,
          ),
        })),
      ),
    })
  }
  const userMatch = path.match(/^\/admin\/users\/([^/]+)$/)
  if (userMatch && request.method === 'PATCH') {
    const id = z.string().min(1).max(200).parse(userMatch[1])
    const body = await readJson(
      request,
      z.object({
        dailyTokenLimit: z.number().int().min(0).max(2_000_000_000),
        requestsPerMinute: z.number().int().min(1).max(300),
        banned: z.boolean(),
        usageDelta: z
          .number()
          .int()
          .min(-2_000_000_000)
          .max(2_000_000_000)
          .default(0),
      }),
    )
    if (id === user.id && body.banned)
      throw new HttpError(400, 'CANNOT_DISABLE_SELF', '不能停用当前管理员账号')
    const target = await db.user.findUnique({ where: { id } })
    if (!target) throw new HttpError(404, 'NOT_FOUND', '用户不存在')
    await db.user.update({
      where: { id },
      data: {
        dailyTokenLimit: body.dailyTokenLimit,
        requestsPerMinute: body.requestsPerMinute,
        banned: body.banned,
      },
    })
    if (body.usageDelta) await budgetFor(`user:${id}`).adjust(body.usageDelta)
    await audit(user.id, 'USER_LIMIT_UPDATED', id, body)
    return Response.json({ ok: true })
  }
  if (path === '/admin/monitor') {
    const day = chinaDay()
    const [users, requests, errors, tokens, recent, auditLogs] =
      await Promise.all([
        db.user.count(),
        db.usageEvent.count({ where: { day } }),
        db.usageEvent.count({ where: { day, status: 'failed' } }),
        db.usageEvent.aggregate({
          where: { day },
          _sum: { totalTokens: true, inputTokens: true, outputTokens: true },
        }),
        env.DB.prepare(
          'SELECT u.*, p.email FROM UsageEvent u LEFT JOIN User p ON p.id=u.userId ORDER BY u.createdAt DESC LIMIT 50',
        ).all(),
        db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
      ])
    return Response.json({
      day,
      users,
      requests,
      errors,
      tokens: tokens._sum,
      recent: recent.results,
      auditLogs,
    })
  }
  throw new HttpError(404, 'NOT_FOUND', '接口不存在')
}
