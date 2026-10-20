import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { providerInput } from '../src/lib/shared'
const base = 'https://kaogong.guygubaby.top'
const admin = z
  .object({ email: z.string(), password: z.string() })
  .parse(JSON.parse(readFileSync('.local/bootstrap.json', 'utf8')))
const config = providerInput
  .extend({ modelId: z.string() })
  .parse(JSON.parse(readFileSync('.local/initial-provider.json', 'utf8')))
if (existsSync('.local/active-provider.json'))
  config.id = z
    .object({ providerId: z.string().uuid() })
    .parse(
      JSON.parse(readFileSync('.local/active-provider.json', 'utf8')),
    ).providerId
const login = await fetch(`${base}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify(admin),
})
assert(login.ok, '管理员登录失败')
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ')
async function call<T>(
  path: string,
  method: string,
  body: unknown,
  schema: z.ZodType<T>,
) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: {
      Cookie: cookie,
      Origin: base,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const value: unknown = await response.json()
  if (!response.ok) {
    const error = z
      .object({
        error: z.object({
          message: z.string(),
          details: z.unknown().optional(),
        }),
      })
      .safeParse(value)
    throw new Error(
      `${path}: ${error.success ? error.data.error.message + ' ' + JSON.stringify(error.data.error.details ?? '') : response.status}`,
    )
  }
  return schema.parse(value)
}
const models = await call(
  'admin/providers/discover',
  'POST',
  config,
  z.object({ models: z.array(z.string()) }),
)
assert(models.models.includes(config.modelId), '网关未返回指定模型')
console.log(`Workers 已成功发现 ${models.models.length} 个模型，指定模型存在。`)
const test = await call(
  'admin/providers/test',
  'POST',
  config,
  z.object({ ok: z.boolean(), message: z.string(), latencyMs: z.number() }),
)
assert(test.ok && test.message, '模型测试没有返回内容')
console.log(`真实模型连接成功：${test.latencyMs} 毫秒；回复：${test.message}`)
const provider = await call(
  'admin/providers',
  'POST',
  config,
  z.object({ id: z.string().uuid() }),
)
await call(
  'admin/settings',
  'PATCH',
  {
    defaultProviderId: provider.id,
    defaultModelId: config.modelId,
    registrationEnabled: true,
  },
  z.unknown(),
)
writeFileSync(
  '.local/active-provider.json',
  JSON.stringify({ providerId: provider.id, modelId: config.modelId }),
)
console.log('Provider 已加密保存，并设为默认学习模型。')
