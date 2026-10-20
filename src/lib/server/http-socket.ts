import { Buffer } from 'node:buffer'
import { HTTPParser } from 'http-parser-js'
import { HttpError } from './http'

const protocolError = () =>
  new HttpError(502, 'PROVIDER_HTTP_INVALID', '上游 HTTP 响应不完整或格式无效')

export function socketResponse(
  readable: ReadableStream<Uint8Array>,
  close: () => void,
  signal: AbortSignal,
  head = false,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const reader = readable.getReader()
    const parser = new HTTPParser(HTTPParser.RESPONSE)
    parser.maxHeaderSize = 32_768
    let controller: ReadableStreamDefaultController<Uint8Array>
    let ended = false
    let finalHeaders = false
    let size = 0
    let timer: ReturnType<typeof setTimeout>
    const cleanup = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      void reader.cancel().catch(() => {})
      close()
    }
    const fail = (error: unknown) => {
      if (ended) return
      ended = true
      reject(error)
      controller.error(error)
      cleanup()
    }
    const abort = () => fail(signal.reason)
    const timeout = () =>
      fail(new HttpError(504, 'PROVIDER_TIMEOUT', '上游响应超时，请稍后重试'))
    const body = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value
      },
      async pull() {
        try {
          while (!ended && (controller.desiredSize ?? 0) > 0) {
            const chunk = await reader.read()
            if (ended) return
            clearTimeout(timer)
            timer = setTimeout(timeout, 90_000)
            if (chunk.done) {
              const error = parser.finish()
              if (error || !ended) throw protocolError()
              return
            }
            size += chunk.value.byteLength
            if (size > 16_000_000)
              throw new HttpError(
                502,
                'PROVIDER_RESPONSE_TOO_LARGE',
                '上游响应超过大小限制',
              )
            const error = parser.execute(Buffer.from(chunk.value))
            if (error instanceof Error) throw protocolError()
          }
        } catch (error) {
          fail(error)
        }
      },
      cancel() {
        ended = true
        cleanup()
      },
    })
    parser[HTTPParser.kOnHeadersComplete] = (info) => {
      if (info.statusCode < 200) {
        if (info.statusCode === 101) throw protocolError()
        return 1
      }
      if (finalHeaders) throw protocolError()
      finalHeaders = true
      const headers = new Headers()
      for (let i = 0; i < info.headers.length; i += 2)
        headers.append(info.headers[i], info.headers[i + 1])
      if (
        headers.has('content-encoding') &&
        headers.get('content-encoding') !== 'identity'
      )
        throw protocolError()
      for (const name of [
        'connection',
        'keep-alive',
        'transfer-encoding',
        'trailer',
        'upgrade',
      ])
        headers.delete(name)
      const hasBody = !head && ![204, 205, 304].includes(info.statusCode)
      resolve(
        new Response(hasBody ? body : null, {
          status: info.statusCode,
          headers,
        }),
      )
      return hasBody ? 0 : 1
    }
    parser[HTTPParser.kOnBody] = (chunk, offset, length) =>
      controller.enqueue(
        new Uint8Array(chunk.subarray(offset, offset + length)),
      )
    parser[HTTPParser.kOnMessageComplete] = () => {
      if (!finalHeaders || ended) return
      ended = true
      controller.close()
      cleanup()
    }
    timer = setTimeout(timeout, 20_000)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

// Workers fetch 不支持直连 IP；仅对管理员配置的公网 IPv4 HTTP 网关使用 TCP。
export async function httpSocketFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const request = new Request(input, init)
  const url = new URL(request.url)
  const payload = await request.arrayBuffer()
  if (payload.byteLength > 2_000_000)
    throw new HttpError(
      413,
      'PROVIDER_REQUEST_TOO_LARGE',
      '学习上下文过长，请新建对话',
    )
  request.signal.throwIfAborted()
  const { connect } = await import('cloudflare:sockets')
  const socket = connect({
    hostname: url.hostname,
    port: Number(url.port || 80),
  })
  const close = () => {
    void socket.close().catch(() => {})
  }
  void socket.closed.catch(() => {})
  const headers = new Headers(request.headers)
  headers.set('host', url.host)
  headers.set('connection', 'close')
  headers.set('accept-encoding', 'identity')
  headers.delete('transfer-encoding')
  headers.set('content-length', String(payload.byteLength))
  let header = `${request.method} ${url.pathname}${url.search} HTTP/1.1\r\n`
  headers.forEach((value, key) => {
    header += `${key}: ${value}\r\n`
  })
  const response = socketResponse(
    socket.readable,
    close,
    request.signal,
    request.method === 'HEAD',
  )
  const writer = socket.writable.getWriter()
  void writer
    .write(Buffer.concat([Buffer.from(header + '\r\n'), Buffer.from(payload)]))
    .catch(() => close())
    .finally(() => writer.releaseLock())
  return response
}
