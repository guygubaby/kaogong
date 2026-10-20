import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { http } from '@/lib/client'
import { cnNumber, type BudgetSnapshot } from '@/lib/shared'
import { formatTime } from '@/lib/utils'
import { PageHeading } from '@/components/app/shell'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/learn/usage')({ component: Usage })
export type UsageRow = {
  id: string
  modelId: string | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
  status: string
  latencyMs: number
  createdAt: string
  email?: string
  errorCode?: string
}
export const statusLabels: Record<string, string> = {
  success: '完成',
  failed: '失败',
  aborted: '已停止',
  test_success: '连接测试',
}
function Usage() {
  const data = useQuery({
    queryKey: ['usage'],
    queryFn: () =>
      http.get('usage').json<{ budget: BudgetSnapshot; events: UsageRow[] }>(),
  })
  const budget = data.data?.budget
  return (
    <main className="mx-auto max-w-6xl px-6 py-20 md:px-10 lg:py-12">
      <PageHeading
        eyebrow="每一点积累，都看得见"
        title="我的学习额度。"
        description="输入、输出及 Agent 检索循环产生的模型消耗，都会计入额度。每天 00:00 按中国标准时间重置。"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void data.refetch()
            }}
          >
            <RefreshCw />
            刷新
          </Button>
        }
      />
      {data.isError && (
        <p role="alert" className="mb-6 text-sm text-destructive">
          额度信息暂时无法加载。
        </p>
      )}
      <div className="mb-12 grid gap-4 sm:grid-cols-3">
        {[
          { title: '今日已使用', value: budget?.used, hint: 'tokens' },
          {
            title: '今日剩余',
            value: budget?.remaining,
            hint: budget?.reserved
              ? `生成中预留 ${cnNumber(budget.reserved)} tokens`
              : 'tokens',
          },
          {
            title: '每日上限',
            value: budget?.limit,
            hint: `每分钟 ${budget?.requestsPerMinute ?? 30} 次接口调用`,
          },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-border p-6"
          >
            <p className="mb-7 text-xs text-muted-foreground">{item.title}</p>
            <p className="text-2xl font-medium tabular-nums">
              {item.value === undefined ? '—' : cnNumber(item.value)}
            </p>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {item.hint}
            </p>
          </div>
        ))}
      </div>
      <h2 className="mb-5 text-lg font-medium">最近调用记录</h2>
      <UsageTable rows={data.data?.events ?? []} />
      <p className="mt-6 text-xs leading-7 text-muted-foreground">
        生成开始前会预留额度，正常完成后按上游实际 usage
        结算。若中断后无法获得实际消耗，将按预留上限保守记账；可联系管理员核查并调整。
      </p>
    </main>
  )
}
export function UsageTable({
  rows,
  admin = false,
}: {
  rows: UsageRow[]
  admin?: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-160 text-left text-xs">
        <thead className="bg-secondary text-muted-foreground">
          <tr>
            {[
              '时间',
              ...(admin ? ['用户'] : []),
              '模型',
              '输入 / 输出',
              '计入额度',
              '状态',
            ].map((label) => (
              <th key={label} className="px-5 py-4 font-normal">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-5 py-4 whitespace-nowrap text-muted-foreground">
                {formatTime(row.createdAt)}
              </td>
              {admin && (
                <td className="max-w-44 truncate px-5 py-4">
                  {row.email ?? '—'}
                </td>
              )}
              <td className="max-w-48 truncate px-5 py-4">
                {row.modelId ?? '—'}
              </td>
              <td className="px-5 py-4 whitespace-nowrap tabular-nums">
                {cnNumber(row.inputTokens)} / {cnNumber(row.outputTokens)}
              </td>
              <td className="px-5 py-4 tabular-nums">
                {cnNumber(row.totalTokens)}
              </td>
              <td className="px-5 py-4 whitespace-nowrap">
                <span
                  className={
                    row.status === 'failed'
                      ? 'text-destructive'
                      : row.status === 'success'
                        ? 'text-success'
                        : 'text-muted-foreground'
                  }
                >
                  {statusLabels[row.status] ?? row.status}
                </span>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td
                colSpan={admin ? 6 : 5}
                className="p-10 text-center text-muted-foreground"
              >
                暂无调用记录。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
