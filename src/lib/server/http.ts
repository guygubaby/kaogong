import { z } from 'zod'
import { runtime } from './runtime'

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 128 * 1024,
): Promise<T> {
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, 'INVALID_BODY', '请求正文不能为空')
  let size = 0
  const parts: Uint8Array[] = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new HttpError(413, 'BODY_TOO_LARGE', '内容过长，请分段发送')
    }
    parts.push(value)
  }
  let input: unknown
  try {
    input = JSON.parse(new TextDecoder().decode(Buffer.concat(parts)))
  } catch {
    throw new HttpError(400, 'INVALID_JSON', '请求格式不正确')
  }
  const parsed = schema.safeParse(input)
  if (!parsed.success)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      '请检查填写的内容',
      parsed.error.flatten(),
    )
  return parsed.data
}
export function assertOrigin(request: Request) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(runtime().env.APP_URL).origin)
      throw new HttpError(403, 'INVALID_ORIGIN', '不允许跨站提交')
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      throw new HttpError(403, 'INVALID_ORIGIN', '不允许跨站提交')
  }
}
export function errorResponse(error: unknown, requestId: string) {
  if (error instanceof z.ZodError)
    return Response.json(
      {
        error: { code: 'VALIDATION_ERROR', message: '请求参数格式不正确' },
        requestId,
      },
      { status: 400 },
    )
  if (error instanceof HttpError)
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        requestId,
      },
      {
        status: error.status,
        headers: error.status === 429 ? { 'Retry-After': '60' } : {},
      },
    )
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'request_failed',
      requestId,
      name: error instanceof Error ? error.name : 'UnknownError',
    }),
  )
  return Response.json(
    {
      error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试' },
      requestId,
    },
    { status: 500 },
  )
}
export function chinaDay(now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
