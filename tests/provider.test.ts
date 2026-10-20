import { describe, expect, it, vi } from 'vitest'
import { normalizeBaseUrl, providerFetch } from '../src/lib/server/provider'

describe('自定义 Provider 请求', () => {
  it('保留网关前缀，并去除误填的完整推理端点', () => {
    expect(
      normalizeBaseUrl('https://example.com/zen/go/v1/chat/completions'),
    ).toBe('https://example.com/zen/go/v1')
    expect(normalizeBaseUrl('https://example.com')).toBe(
      'https://example.com/v1',
    )
  })
  it.each([
    'http://169.254.169.254',
    'http://10.0.0.1',
    'http://172.31.0.1',
    'http://192.168.1.1',
    'http://100.64.0.1',
    'https://127.0.0.1/v1',
    'https://localhost/v1',
    'https://[::1]/v1',
    'https://user:pass@example.com/v1',
    'https://example.com/v1?key=secret',
  ])('拒绝不安全的地址 %s', (url) =>
    expect(() => normalizeBaseUrl(url)).toThrow(),
  )
  it('覆盖不受 Workers 支持的 redirect:error，并在多次请求中保持会话头', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    const fetcher = providerFetch(
      'https://example.com/v1',
      'conversation-stable',
      upstream,
    )
    for (const path of ['models', 'chat/completions'])
      await fetcher(`https://example.com/v1/${path}`, {
        redirect: 'error',
        headers: { Authorization: 'Bearer test-secret' },
      })
    for (const [, init] of upstream.mock.calls) {
      const headers = new Headers(init?.headers)
      expect(init?.redirect).toBe('manual')
      expect(headers.get('x-opencode-session')).toBe('conversation-stable')
      expect(headers.get('user-agent')).toBe('kaogong-learning-agent/1.0')
      expect(headers.get('authorization')).toBe('Bearer test-secret')
    }
  })
  it('不跟随重定向，也不会把密钥发给其他源', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://other.example' },
      }),
    )
    const fetcher = providerFetch('https://example.com/v1', 'session', upstream)
    await expect(fetcher('https://example.com/v1/models')).rejects.toThrow(
      '重定向',
    )
    await expect(fetcher('https://other.example/v1/models')).rejects.toThrow(
      '不符合',
    )
    expect(upstream).toHaveBeenCalledTimes(1)
  })
})

it('同源 307 保留请求正文与稳定会话，且不会使用 redirect:error', async () => {
  const upstream = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(null, {
        status: 307,
        headers: { location: '/v1/chat/completions/' },
      }),
    )
    .mockResolvedValueOnce(new Response('{}'))
  const fetcher = providerFetch('https://example.com/v1', 'stable', upstream)
  await fetcher('https://example.com/v1/chat/completions', {
    method: 'POST',
    body: '{"model":"test"}',
  })
  expect(String(upstream.mock.calls[1][0])).toBe(
    'https://example.com/v1/chat/completions/',
  )
  expect(upstream.mock.calls[1][1]?.body).toBe('{"model":"test"}')
  expect(
    new Headers(upstream.mock.calls[1][1]?.headers).get('x-opencode-session'),
  ).toBe('stable')
})
