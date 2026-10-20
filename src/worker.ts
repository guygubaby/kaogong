import start from '@tanstack/react-start/server-entry'
import { requestRuntime } from './lib/server/runtime'
export { UserBudget } from './lib/server/budget'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const requestId = crypto.randomUUID()
    const forwarded = new Request(request, {
      headers: new Headers(request.headers),
    })
    forwarded.headers.set('x-request-id', requestId)
    const response = await requestRuntime.run({ env, ctx }, () =>
      start.fetch(forwarded),
    )
    const secured = new Response(response.body, response)
    secured.headers.set('X-Request-Id', requestId)
    secured.headers.set('X-Content-Type-Options', 'nosniff')
    secured.headers.set('X-Frame-Options', 'DENY')
    secured.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    secured.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    )
    if (new URL(request.url).pathname.startsWith('/api/'))
      secured.headers.set('Cache-Control', 'no-store')
    return secured
  },
} satisfies ExportedHandler<Env>
