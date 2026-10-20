import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { http } from '@/lib/client'
import type { KnowledgeItem } from '@/lib/shared'
import { PageHeading } from '@/components/app/shell'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/markdown'

export const Route = createFileRoute('/learn/library')({
  validateSearch: z.object({
    q: z.string().max(120).default(''),
    module: z.string().optional(),
    page: z.number().int().min(1).default(1),
    doc: z.string().optional(),
  }),
  component: Library,
})
function Library() {
  const params = Route.useSearch(),
    navigate = useNavigate(),
    [input, setInput] = useState(params.q)
  const modules = useQuery({
    queryKey: ['knowledge-modules'],
    queryFn: () =>
      http.get('knowledge/modules').json<{ module: string; count: number }[]>(),
  })
  const documents = useQuery({
    queryKey: ['knowledge', params.q, params.module, params.page],
    queryFn: () =>
      http
        .get('knowledge/documents', {
          searchParams: {
            q: params.q,
            ...(params.module ? { module: params.module } : {}),
            page: params.page,
          },
        })
        .json<{ items: KnowledgeItem[]; page: number }>(),
    enabled: !params.doc,
  })
  const document = useQuery({
    queryKey: ['document', params.doc],
    queryFn: () =>
      http
        .get(`knowledge/documents/${params.doc}`)
        .json<KnowledgeItem & { body: string }>(),
    enabled: Boolean(params.doc),
  })
  const update = (next: Partial<typeof params>) =>
    navigate({ to: '/learn/library', search: { ...params, ...next } })
  if (params.doc)
    return (
      <main className="mx-auto max-w-4xl px-6 py-18 md:px-12 lg:py-12">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void update({ doc: undefined })
          }}
        >
          <ChevronLeft />
          返回知识库
        </Button>
        {document.isError ? (
          <p role="alert" className="mt-12 text-sm text-destructive">
            资料暂时无法加载，请稍后重试。
          </p>
        ) : document.data ? (
          <>
            <p className="mt-9 mb-6 text-xs text-muted-foreground">
              {document.data.module} / 学习资料
            </p>
            {document.data.issue && (
              <div className="mb-8 rounded-xl bg-amber-50 p-4 text-sm leading-7 text-amber-800">
                这份资料包含已知疑点或图片缺失。请对照题干、原图和解析核查，不能仅据自动标注下结论。
              </div>
            )}
            <Markdown>{document.data.body}</Markdown>
          </>
        ) : (
          <p className="mt-12 text-sm text-muted-foreground">正在读取资料…</p>
        )}
      </main>
    )
  return (
    <main className="mx-auto max-w-6xl px-6 py-20 md:px-10 lg:py-12">
      <PageHeading
        eyebrow="有体系，也有细节"
        title="把知识，连起来。"
        description="按模块阅读讲义，检索具体考点，或沿着真题找到不同的考法。所有资料均可在线打开。"
      />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void update({ q: input, page: 1 })
        }}
        className="mb-8 flex items-center gap-3 rounded-2xl border border-border px-4 py-2"
      >
        <Search size={18} className="text-muted-foreground" />
        <label htmlFor="knowledge-search" className="sr-only">
          搜索知识点
        </label>
        <input
          id="knowledge-search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={120}
          placeholder="搜索考点、题号、材料关键词…"
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {params.q && (
          <button
            type="button"
            aria-label="清除搜索"
            onClick={() => {
              setInput('')
              void update({ q: '', page: 1 })
            }}
          >
            <X size={16} />
          </button>
        )}
        <Button size="sm" type="submit">
          搜索
        </Button>
      </form>
      <div className="mb-9 flex flex-wrap gap-2">
        <button
          onClick={() => {
            void update({ module: undefined, page: 1 })
          }}
          className={`rounded-full px-4 py-2 text-xs ${!params.module ? 'bg-foreground text-white' : 'bg-secondary text-muted-foreground'}`}
        >
          全部资料
        </button>
        {modules.data?.map((item) => (
          <button
            key={item.module}
            onClick={() => {
              void update({ module: item.module, page: 1 })
            }}
            className={`rounded-full px-4 py-2 text-xs ${params.module === item.module ? 'bg-foreground text-white' : 'bg-secondary text-muted-foreground'}`}
          >
            {item.module}
            <span className="ml-2 opacity-50">{item.count}</span>
          </button>
        ))}
      </div>
      {documents.isError ? (
        <p
          role="alert"
          className="rounded-xl bg-secondary p-6 text-sm text-muted-foreground"
        >
          知识库正在准备中，请稍后重试。
        </p>
      ) : documents.isPending ? (
        <p className="py-12 text-sm text-muted-foreground">正在查找资料…</p>
      ) : !documents.data?.items.length ? (
        <p className="py-12 text-sm text-muted-foreground">
          没有找到对应内容。试试更短的关键词、同义词，或切换模块。
        </p>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {documents.data.items.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                void update({ doc: item.id })
              }}
              className="group flex w-full items-start justify-between gap-5 py-6 text-left"
            >
              <div className="flex min-w-0 items-start gap-4">
                <BookOpen
                  size={19}
                  className="mt-1 shrink-0 text-muted-foreground"
                />
                <div>
                  <p className="text-sm leading-7 group-hover:text-primary">
                    {item.title}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {item.module} ·{' '}
                    {{
                      lecture: '讲义',
                      question: '真题',
                      topic: '考点',
                      material: '材料',
                      skill: '索引',
                    }[item.kind] ?? '资料'}
                    {item.issue ? ' · 有已知疑点' : ''}
                  </p>
                </div>
              </div>
              <ChevronRight
                size={16}
                className="mt-2 shrink-0 text-muted-foreground"
              />
            </button>
          ))}
        </div>
      )}
      <div className="mt-8 flex justify-end gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={params.page <= 1}
          onClick={() => {
            void update({ page: params.page - 1 })
          }}
        >
          上一页
        </Button>
        <span className="self-center text-xs text-muted-foreground">
          第 {params.page} 页
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={
            Boolean(params.q) ||
            !documents.data ||
            documents.data.items.length < 30
          }
          onClick={() => {
            void update({ page: params.page + 1 })
          }}
        >
          下一页
        </Button>
      </div>
    </main>
  )
}
