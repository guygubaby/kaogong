import { createFileRoute } from '@tanstack/react-router'
import { api } from '@/lib/server/api'

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: ({ request }) => api(request),
      POST: ({ request }) => api(request),
      PATCH: ({ request }) => api(request),
      DELETE: ({ request }) => api(request),
    },
  },
})
