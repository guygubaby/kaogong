import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { http } from '@/lib/client'
import { cnNumber } from '@/lib/shared'
import { formatTime } from '@/lib/utils'
import { PageHeading } from '@/components/app/shell'
import { Button } from '@/components/ui/button'
import { UsageTable, type UsageRow } from './learn.usage'

export const Route = createFileRoute('/learn/admin/monitor')({
  component: Monitor,
})
type MonitorData = {
  day: string
  users: number
  requests: number
  errors: number
  tokens: {
    totalTokens: number | null
    inputTokens: number | null
    outputTokens: number | null
  }
  recent: UsageRow[]
  auditLogs: {
    id: string
    action: string
    actorId: string
    targetId: string | null
    createdAt: string
  }[]
}
const auditLabels: Record<string, string> = {
  ADMIN_INITIALIZED: '初始化管理员',
  PROVIDER_SAVED: '保存模型连接',
  SETTINGS_UPDATED: '修改站点设置',
  USER_LIMIT_UPDATED: '调整用户额度',
}
function Monitor() {
  const data = useQuery({
    queryKey: ['monitor'],
    queryFn: () => http.get('admin/monitor').json<MonitorData>(),
    refetchInterval: 30_000,
  })
  const state = data.data
  return (
    <main className="mx-auto max-w-6xl px-6 py-20 md:px-10 lg:py-12">
      <PageHeading
        eyebrow="管理工作台"
        title="学习服务，运行之中。"
        description="查看今天的调用与消耗，核对失败请求及管理操作。每 30 秒自动刷新，统计日期使用中国标准时间。"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void data.refetch()
            }}
          >
            <RefreshCw />
            立即刷新
          </Button>
        }
      />
      {data.isError && (
        <p role="alert" className="mb-6 text-sm text-destructive">
          监控数据暂时无法加载。
        </p>
      )}
      <div className="mb-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '注册用户', value: state?.users },
          { label: '今日调用', value: state?.requests },
          { label: '今日额度消耗', value: state?.tokens.totalTokens ?? 0 },
          { label: '今日失败', value: state?.errors },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-border p-6"
          >
            <p className="mb-8 text-xs text-muted-foreground">{item.label}</p>
            <p className="text-3xl font-medium tabular-nums">
              {item.value === undefined ? '—' : cnNumber(item.value)}
            </p>
            <p className="mt-3 text-[10px] text-muted-foreground">
              {state?.day ?? '正在同步'}
            </p>
          </div>
        ))}
      </div>
      <h2 className="mb-5 text-lg font-medium">最近 50 次调用</h2>
      <UsageTable rows={state?.recent ?? []} admin />
      <section className="mt-12">
        <h2 className="mb-5 text-lg font-medium">管理操作记录</h2>
        <div className="divide-y divide-border rounded-2xl border border-border">
          {state?.auditLogs.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs"
            >
              <span>{auditLabels[item.action] ?? item.action}</span>
              <span className="text-muted-foreground">
                {formatTime(item.createdAt)}
              </span>
            </div>
          ))}
          {!state?.auditLogs.length && (
            <p className="p-8 text-center text-xs text-muted-foreground">
              暂无管理操作。
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
