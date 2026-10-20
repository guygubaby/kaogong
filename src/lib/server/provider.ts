import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { z } from 'zod'
import { joinURL } from 'ufo'
import type { ProviderInput } from '../shared'
import { HttpError } from './http'
import { httpSocketFetch } from './http-socket'

const transportFetch: typeof fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  return url.protocol === 'http:' && /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
    ? httpSocketFetch(input, init)
    : fetch(input, init)
}

export function normalizeBaseUrl(value: string) {
  const url = new URL(value)
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(host)
    ? host.split('.').map(Number)
    : null
  const privateIp =
    ipv4 &&
    (ipv4[0] === 0 ||
      ipv4[0] === 10 ||
      ipv4[0] === 127 ||
      ipv4[0] >= 224 ||
      (ipv4[0] === 169 && ipv4[1] === 254) ||
      (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
      (ipv4[0] === 192 && ipv4[1] === 168) ||
      (ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127) ||
      (ipv4[0] === 198 && (ipv4[1] === 18 || ipv4[1] === 19)))
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.includes(':') ||
    privateIp ||
    /^\d+$/.test(host)
  ) {
    throw new HttpError(
      400,
      'INVALID_PROVIDER_URL',
      '请填写公开可访问的 HTTP 或 HTTPS 地址，不支持内网或本机地址',
    )
  }
  url.pathname = url.pathname
    .replace(/\/(chat\/completions|responses|messages|models)\/?$/, '')
    .replace(/\/$/, '')
  if (!url.pathname || url.pathname === '/') url.pathname = '/v1'
  return url.toString().replace(/\/$/, '')
}

export function providerFetch(
  baseUrl: string,
  sessionId: string,
  upstream: typeof fetch = transportFetch,
): typeof fetch {
  const origin = new URL(normalizeBaseUrl(baseUrl)).origin
  return async (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input))
    if (target.origin !== origin)
      throw new HttpError(
        502,
        'PROVIDER_REDIRECT',
        '上游请求地址不符合当前配置',
      )
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    )
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    headers.set('user-agent', 'kaogong-learning-agent/1.0')
    headers.set('x-opencode-session', sessionId)
    const method =
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    let current: RequestInfo | URL = input
    // Workers 不支持 redirect:error；只跟随同源、保留方法的跳转，不跨源携带密钥。
    for (let redirects = 0; redirects < 4; redirects++) {
      const response = await upstream(current, {
        ...init,
        headers,
        redirect: 'manual',
      })
      if (response.status < 300 || response.status >= 400) return response
      const location = response.headers.get('location')
      const next = location
        ? new URL(
            location,
            current instanceof Request ? current.url : String(current),
          )
        : null
      const safeReplay =
        method === 'GET' ||
        method === 'HEAD' ||
        response.status === 307 ||
        response.status === 308
      if (
        !next ||
        next.origin !== origin ||
        !safeReplay ||
        input instanceof Request ||
        init?.body instanceof ReadableStream
      ) {
        throw new HttpError(
          502,
          'PROVIDER_REDIRECT',
          '上游发生不安全的重定向，请检查最终 API 地址',
          {
            status: response.status,
            destination: next ? next.origin + next.pathname : null,
          },
        )
      }
      await response.body?.cancel()
      current = next
    }
    throw new HttpError(502, 'PROVIDER_REDIRECT', '上游重定向次数过多')
  }
}

export function languageModel(
  config: Pick<ProviderInput, 'protocol' | 'baseUrl'>,
  apiKey: string,
  model: string,
  sessionId: string,
) {
  const baseURL = normalizeBaseUrl(config.baseUrl)
  const fetcher = providerFetch(baseURL, sessionId)
  if (config.protocol === 'anthropic')
    return createAnthropic({ baseURL, apiKey, fetch: fetcher })(model)
  const provider = createOpenAI({ baseURL, apiKey, fetch: fetcher })
  return config.protocol === 'responses'
    ? provider.responses(model)
    : provider.chat(model)
}

export async function discoverModels(
  config: Pick<ProviderInput, 'protocol' | 'baseUrl'>,
  apiKey: string,
  sessionId: string,
) {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const headers: Record<string, string> =
    config.protocol === 'anthropic'
      ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${apiKey}` }
  const response = await providerFetch(baseUrl, sessionId)(
    joinURL(baseUrl, 'models'),
    {
      headers,
      signal: AbortSignal.timeout(20_000),
    },
  )
  if (!response.ok) {
    const reader = response.body?.getReader()
    const first = await reader?.read()
    await reader?.cancel()
    const excerpt = new TextDecoder()
      .decode(first?.value)
      .slice(0, 1500)
      .replaceAll(apiKey, '[已隐藏]')
    throw new HttpError(
      502,
      'MODELS_FAILED',
      `拉取模型失败（上游状态 ${response.status}）`,
      { upstreamResponse: excerpt },
    )
  }
  const reader = response.body?.getReader()
  if (!reader) throw new HttpError(502, 'MODELS_INVALID', '上游模型列表为空')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 2_000_000) {
      await reader.cancel()
      throw new HttpError(502, 'MODELS_TOO_LARGE', '上游模型列表过大')
    }
    chunks.push(value)
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks))
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new HttpError(502, 'MODELS_INVALID', '上游返回了无效的模型列表')
  }
  const parsed = z
    .object({
      data: z.array(z.object({ id: z.string().min(1).max(200) })).max(2000),
    })
    .safeParse(data)
  if (!parsed.success)
    throw new HttpError(
      502,
      'MODELS_INVALID',
      '模型列表需要包含 data 数组和模型 id',
    )
  return [...new Set(parsed.data.data.map((model) => model.id))].sort()
}

export async function testProvider(
  config: Pick<ProviderInput, 'protocol' | 'baseUrl' | 'maxOutputTokens'>,
  apiKey: string,
  model: string,
  sessionId: string,
) {
  const started = Date.now()
  const result = await generateText({
    model: languageModel(config, apiKey, model, sessionId),
    prompt: '只回复：连接成功',
    maxOutputTokens: config.maxOutputTokens,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(30_000),
  })
  return {
    ok: true,
    message: result.text,
    latencyMs: Date.now() - started,
    usage: result.totalUsage,
  }
}
