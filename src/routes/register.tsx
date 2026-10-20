import { createFileRoute } from '@tanstack/react-router'
import { AuthForm } from '@/components/auth-form'
export const Route = createFileRoute('/register')({
  head: () => ({ meta: [{ title: '免费注册 · 考公' }] }),
  component: () => <AuthForm register />,
})
