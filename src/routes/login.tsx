import { createFileRoute } from '@tanstack/react-router'
import { AuthForm } from '@/components/auth-form'
export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: '登录 · 考公' }] }),
  component: () => <AuthForm register={false} />,
})
