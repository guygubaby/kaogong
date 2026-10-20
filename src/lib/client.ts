import ky, { HTTPError } from 'ky'
import { createAuthClient } from 'better-auth/react'
import { queryOptions } from '@tanstack/react-query'
import type { Me } from './shared'

export const authClient = createAuthClient()
export const http = ky.create({
  prefix: '/api/',
  timeout: 60_000,
  retry: 0,
  credentials: 'same-origin',
  hooks: {
    beforeError: [
      async ({ error }) => {
        if (error instanceof HTTPError) {
          const body = (await error.response
            .clone()
            .json()
            .catch(() => null)) as { error?: { message?: string } } | null
          if (body?.error?.message) error.message = body.error.message
        }
        return error
      },
    ],
  },
})
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => http.get('me').json<Me>(),
  staleTime: 15_000,
  retry: false,
})
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请稍后重试'
