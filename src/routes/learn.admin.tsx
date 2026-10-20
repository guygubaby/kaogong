import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { meQuery } from '@/lib/client'
export const Route = createFileRoute('/learn/admin')({ component: Admin })
function Admin() {
  const me = useQuery(meQuery)
  return me.data?.user.role === 'admin' ? (
    <Outlet />
  ) : (
    <main className="p-12 text-sm">此页面仅对管理员开放。</main>
  )
}
