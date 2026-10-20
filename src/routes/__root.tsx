import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { Toaster } from 'sonner'
import type { ReactNode } from 'react'
import styles from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: '考公 · 学有所据，考有所成' },
        {
          name: 'description',
          content:
            '公考知识库与 AI 学习导师。行测、申论、综应，读原文、懂考点、会方法。',
        },
        { name: 'theme-color', content: '#fbfcff' },
      ],
      links: [
        { rel: 'stylesheet', href: styles },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    }),
    component: Root,
    shellComponent: Document,
    notFoundComponent: () => (
      <main className="grid min-h-svh place-content-center gap-6 text-center">
        <h1 className="text-4xl">这一页暂时没有收录。</h1>
        <Link to="/" className="text-primary underline underline-offset-4">
          返回首页
        </Link>
      </main>
    ),
    errorComponent: ({ error, reset }) => (
      <main className="grid min-h-svh place-content-center gap-5 px-6 text-center">
        <h1 className="text-3xl">页面暂时未能加载</h1>
        <p className="text-muted-foreground">
          请稍后重试，或返回上一页继续学习。
        </p>
        <button
          onClick={reset}
          className="rounded-full bg-foreground px-6 py-3 text-background"
        >
          重新加载
        </button>
        <span className="sr-only">
          {error instanceof Error ? error.name : 'Error'}
        </span>
      </main>
    ),
  },
)
function Root() {
  const { queryClient } = Route.useRouteContext()
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <Outlet />
      </MotionConfig>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  )
}
function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <noscript>
          <style>
            {
              '.reveal-word{transform:none!important;opacity:1!important}.first-loader{display:none!important}'
            }
          </style>
        </noscript>
      </body>
    </html>
  )
}
