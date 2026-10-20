import { expect, it, vi } from 'vitest'
import { socketResponse } from '../src/lib/server/http-socket'

const fragments = (parts: string[]) =>
  new ReadableStream<Uint8Array>({
    pull(controller) {
      const part = parts.shift()
      if (part === undefined) controller.close()
      else controller.enqueue(new TextEncoder().encode(part))
    },
  })

it('将分包 HTTP 响应的 chunked SSE 还原为可流式读取的响应，并及时关闭连接', async () => {
  const close = vi.fn()
  const response = await socketResponse(
    fragments([
      'HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 O',
      'K\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n',
      '9\r\ndata: a\n\n\r\n',
      '9\r\ndata: b\n\n\r\n0\r\n\r\n',
    ]),
    close,
    new AbortController().signal,
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('transfer-encoding')).toBeNull()
  expect(await response.text()).toBe('data: a\n\ndata: b\n\n')
  expect(close).toHaveBeenCalledTimes(1)
})

it('拒绝正文截断，取消流时关闭上游连接', async () => {
  const truncated = await socketResponse(
    fragments(['HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nabc']),
    vi.fn(),
    new AbortController().signal,
  )
  await expect(truncated.text()).rejects.toThrow('不完整')
  const close = vi.fn()
  const response = await socketResponse(
    fragments([
      'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\r\ndata: a\n\n',
      'data: b\n\n',
    ]),
    close,
    new AbortController().signal,
  )
  await response.body!.cancel()
  expect(close).toHaveBeenCalledTimes(1)
})
