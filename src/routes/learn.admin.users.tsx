import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { Save, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { http, errorText } from '@/lib/client'
import { cnNumber, type BudgetSnapshot } from '@/lib/shared'
import { PageHeading } from '@/components/app/shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from './learn.admin.providers'

export const Route = createFileRoute('/learn/admin/users')({ component: Users })
type UserRow = {
  id: string
  name: string
  email: string
  role: string
  banned: boolean
  dailyTokenLimit: number
  requestsPerMinute: number
  budget: BudgetSnapshot
}
function Users() {
  const [query, setQuery] = useState(''),
    [input, setInput] = useState(''),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<UserRow | null>(null)
  const users = useQuery({
    queryKey: ['users', query, page],
    queryFn: () =>
      http
        .get('admin/users', { searchParams: { q: query, page } })
        .json<{ users: UserRow[]; total: number }>(),
  })
  return (
    <main className="mx-auto max-w-6xl px-6 py-20 md:px-10 lg:py-12">
      <PageHeading
        eyebrow="管理工作台"
        title="看见每位学习者。"
        description="查看用户的实时额度占用，调整每日上限、调用频率或今日已用量。所有管理操作都会留下审计记录。"
      />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setQuery(input)
          setPage(1)
        }}
        className="mb-8 flex max-w-md items-center gap-3"
      >
        <Input
          aria-label="搜索用户昵称或邮箱"
          placeholder="搜索昵称或邮箱…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <Button type="submit" variant="outline" aria-label="搜索用户">
          <Search />
        </Button>
      </form>
      {users.isError && (
        <p role="alert" className="mb-5 text-sm text-destructive">
          用户列表加载失败。
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-180 text-left text-xs">
          <thead className="bg-secondary text-muted-foreground">
            <tr>
              {[
                '学习者',
                '今日已用 / 上限',
                '生成中预留',
                '调用频率',
                '状态',
                '管理',
              ].map((label) => (
                <th key={label} className="px-5 py-4 font-normal">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.data?.users.map((user) => (
              <tr key={user.id}>
                <td className="px-5 py-5">
                  <p>
                    {user.name}
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {user.role === 'admin' ? '管理员' : ''}
                    </span>
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {user.email}
                  </p>
                </td>
                <td className="px-5 py-5 tabular-nums">
                  {cnNumber(user.budget.used)} /{' '}
                  {cnNumber(user.dailyTokenLimit)}
                </td>
                <td className="px-5 py-5 text-muted-foreground tabular-nums">
                  {cnNumber(user.budget.reserved)}
                </td>
                <td className="px-5 py-5">{user.requestsPerMinute} 次/分钟</td>
                <td
                  className={`px-5 py-5 ${user.banned ? 'text-destructive' : 'text-success'}`}
                >
                  {user.banned ? '已停用' : '正常'}
                </td>
                <td className="px-5 py-5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(user)}
                  >
                    调整
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-7 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          共 {users.data?.total ?? '—'} 位用户
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!users.data || page * 25 >= users.data.total}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
      {editing && (
        <EditUser
          key={editing.id}
          user={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  )
}
function EditUser({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const client = useQueryClient(),
    [dailyTokenLimit, setLimit] = useState(user.dailyTokenLimit),
    [requestsPerMinute, setRate] = useState(user.requestsPerMinute),
    [banned, setBanned] = useState(user.banned),
    [usageDelta, setDelta] = useState(0)
  const save = useMutation({
    mutationFn: () =>
      http
        .patch(`admin/users/${user.id}`, {
          json: { dailyTokenLimit, requestsPerMinute, banned, usageDelta },
        })
        .json(),
    onSuccess: () => {
      toast.success('用户额度已更新')
      void client.invalidateQueries({ queryKey: ['users'] })
      void client.invalidateQueries({ queryKey: ['me'] })
      onClose()
    },
    onError: (error) => toast.error(errorText(error)),
  })
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-60 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-70 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-background p-7 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="text-xl font-medium">
              调整学习额度
            </Dialog.Title>
            <Dialog.Close aria-label="关闭调整窗口">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-7 text-xs text-muted-foreground">
            {user.name} · {user.email}
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              save.mutate()
            }}
            className="space-y-5"
          >
            <Field label="每日 token 上限" id="user-limit">
              <Input
                id="user-limit"
                type="number"
                min={0}
                max={2000000000}
                value={dailyTokenLimit}
                onChange={(event) => setLimit(Number(event.target.value))}
                required
              />
            </Field>
            <Field label="每分钟接口调用次数" id="user-rate">
              <Input
                id="user-rate"
                type="number"
                min={1}
                max={300}
                value={requestsPerMinute}
                onChange={(event) => setRate(Number(event.target.value))}
                required
              />
            </Field>
            <Field
              label="修正今日已用量（正数补记，负数返还）"
              id="usage-delta"
            >
              <Input
                id="usage-delta"
                type="number"
                value={usageDelta}
                onChange={(event) => setDelta(Number(event.target.value))}
              />
            </Field>
            <p className="text-xs leading-7 text-muted-foreground">
              当前已用 {cnNumber(user.budget.used)} tokens。
              <button
                type="button"
                onClick={() => setDelta(-user.budget.used)}
                className="ml-2 text-primary underline underline-offset-4"
              >
                将今日已用量归零
              </button>
            </p>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={banned}
                onChange={(event) => setBanned(event.target.checked)}
              />
              停用此账号
            </label>
            <Button
              type="submit"
              disabled={save.isPending}
              className="mt-2 w-full"
            >
              <Save />
              保存修改
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
