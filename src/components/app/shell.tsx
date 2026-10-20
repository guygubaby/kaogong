import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, Outlet, useNavigate } from '@tanstack/react-router'
import {
  BookOpen,
  ChartNoAxesCombined,
  ChevronsLeft,
  Gauge,
  LogOut,
  MessageSquare,
  PanelLeft,
  Settings2,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { authClient, meQuery } from '@/lib/client'
import { cnNumber } from '@/lib/shared'
import { Button } from '../ui/button'

const navigation = [
  { to: '/learn', label: '学习对话', icon: MessageSquare },
  { to: '/learn/library', label: '知识库', icon: BookOpen },
  { to: '/learn/usage', label: '我的额度', icon: Gauge },
] as const
const adminNavigation = [
  { to: '/learn/admin/providers', label: '模型配置', icon: Settings2 },
  { to: '/learn/admin/users', label: '用户管理', icon: Users },
  { to: '/learn/admin/monitor', label: '调用监控', icon: ChartNoAxesCombined },
] as const
export function AppShell() {
  const me = useQuery(meQuery),
    [open, setOpen] = useState(false),
    navigate = useNavigate()
  if (me.isError) return <Navigate to="/login" />
  if (!me.data)
    return (
      <main className="grid min-h-svh place-items-center text-sm text-muted-foreground">
        正在打开学习空间…
      </main>
    )
  const { user, budget } = me.data
  return (
    <div className="flex min-h-svh bg-background">
      <button
        onClick={() => setOpen(true)}
        aria-label="打开侧边栏"
        className="fixed top-4 left-4 z-30 grid size-10 place-items-center rounded-full border border-border bg-background lg:hidden"
      >
        <PanelLeft size={18} />
      </button>
      {open && (
        <button
          aria-label="关闭侧边栏遮罩"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/35 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-secondary/50 px-5 py-7 backdrop-blur-xl transition-transform lg:z-20 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="mb-12 flex items-center justify-between px-2">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-brand text-brand-foreground">
              <BookOpen size={22} strokeWidth={1.6} />
            </span>
            <span className="text-lg tracking-widest">考公</span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="收起侧边栏"
            className="lg:hidden"
          >
            <ChevronsLeft size={19} />
          </button>
        </div>
        <nav aria-label="学习空间导航" className="space-y-1">
          {navigation.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: true }}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
              activeProps={{
                className: 'bg-background text-foreground shadow-xs',
              }}
            >
              <Icon size={18} strokeWidth={1.6} />
              {label}
            </Link>
          ))}
          {user.role === 'admin' && (
            <>
              <p className="px-4 pt-9 pb-3 text-[11px] text-muted-foreground">
                管理工作台
              </p>
              {adminNavigation.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
                  activeProps={{
                    className: 'bg-background text-foreground shadow-xs',
                  }}
                >
                  <Icon size={18} strokeWidth={1.6} />
                  {label}
                </Link>
              ))}
            </>
          )}
        </nav>
        <div className="mt-auto pt-10">
          <Link
            to="/learn/usage"
            className="block rounded-2xl border border-border bg-background p-4"
          >
            <div className="mb-3 flex justify-between text-xs">
              <span className="text-muted-foreground">今日已用额度</span>
              <span>
                {budget.limit > 0
                  ? Math.min(100, (budget.used / budget.limit) * 100).toFixed(1)
                  : 100}
                %
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{
                  width: `${budget.limit > 0 ? Math.min(100, (budget.used / budget.limit) * 100) : 100}%`,
                }}
              />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {cnNumber(budget.used)} / {cnNumber(budget.limit)} tokens
            </p>
          </Link>
          <div className="mt-5 flex items-center gap-3 px-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-xs text-white">
              {user.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs">{user.name}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {user.role === 'admin' ? '管理员' : '学习者'}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="退出登录"
              onClick={async () => {
                await authClient.signOut()
                await navigate({ to: '/login' })
              }}
            >
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 lg:ml-64">
        <Outlet />
      </div>
    </div>
  )
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
      {
        <div>
          {eyebrow && (
            <p className="mb-3 text-xs text-muted-foreground">{eyebrow}</p>
          )}
          <h1 className="mb-3 text-3xl font-medium tracking-tight">{title}</h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
            {description}
          </p>
        </div>
      }
      {action}
    </div>
  )
}
