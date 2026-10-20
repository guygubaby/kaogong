import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/app/shell'
export const Route = createFileRoute('/learn')({
  head: () => ({
    meta: [
      { title: '学习空间 · 考公' },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
  }),
  component: AppShell,
})
