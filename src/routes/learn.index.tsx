import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  Loader2,
  Plus,
  Square,
} from 'lucide-react'
import { z } from 'zod'
import { errorText, http } from '@/lib/client'
import type { ChatMessage, Conversation, Source } from '@/lib/shared'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Markdown } from '@/components/markdown'

export const Route = createFileRoute('/learn/')({
  validateSearch: z.object({ chat: z.string().uuid().optional() }),
  component: Learning,
})
type Models = {
  providers: { id: string; name: string; models: string[] }[]
  defaultProviderId?: string
  defaultModelId?: string
}
type StudyMessage = UIMessage<{ sources?: Source[]; totalTokens?: number }>
const transport = new DefaultChatTransport<StudyMessage>({
  api: '/api/chat',
  prepareSendMessagesRequest: ({ messages, body }) => ({
    body: {
      ...body,
      content:
        messages
          .at(-1)
          ?.parts.filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n') ?? '',
    },
  }),
})
const toolLabels: Record<string, string> = {
  'tool-loadSkill': '已加载学习检索指南',
  'tool-searchKnowledge': '检索相关讲义与考点',
  'tool-readDocument': '读取知识库原文',
  'tool-knownIssues': '核对真题疑点',
  'tool-readOriginal': '核对备用原文',
}
const questions = [
  '学习申论需要掌握哪些要素？',
  '间隔增长率有哪些常见考法？',
  '图形推理的一笔画怎么判断？',
  '综合分析题应该如何组织答案？',
]
function Learning() {
  const { chat: chatId } = Route.useSearch(),
    navigate = useNavigate(),
    client = useQueryClient()
  const [firstPrompt, setFirstPrompt] = useState(''),
    [error, setError] = useState('')
  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: () => http.get('conversations').json<Conversation[]>(),
  })
  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => http.get('models').json<Models>(),
  })
  const conversation = useQuery({
    queryKey: ['conversation', chatId],
    queryFn: () =>
      http
        .get(`conversations/${chatId}`)
        .json<Conversation & { messages: ChatMessage[] }>(),
    enabled: Boolean(chatId),
  })
  const create = useMutation({
    mutationFn: (prompt: string) =>
      http
        .post('conversations', {
          json: {
            title: prompt ? [...prompt].slice(0, 24).join('') : '新的学习对话',
          },
        })
        .json<Conversation>(),
    onSuccess: async (result, prompt) => {
      setFirstPrompt(prompt)
      await client.invalidateQueries({ queryKey: ['conversations'] })
      await navigate({ to: '/learn', search: { chat: result.id } })
    },
    onError: (error) => setError(errorText(error)),
  })
  return (
    <div className="flex h-svh min-h-0">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border px-4 py-7 xl:flex">
        <Button
          variant="outline"
          onClick={() => create.mutate('')}
          disabled={create.isPending}
        >
          <Plus />
          新的对话
        </Button>
        <p className="px-3 pt-9 pb-4 text-xs text-muted-foreground">
          最近的学习
        </p>
        <div className="space-y-1 overflow-y-auto">
          {conversations.data?.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setFirstPrompt('')
                void navigate({ to: '/learn', search: { chat: item.id } })
              }}
              className={`block w-full truncate rounded-xl px-3 py-3 text-left text-xs transition-colors ${chatId === item.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/70'}`}
            >
              {item.title}
            </button>
          ))}
          {!conversations.data?.length && (
            <p className="px-3 text-xs leading-6 text-muted-foreground">
              你的问题和思考，
              <br />
              会慢慢积累在这里。
            </p>
          )}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-20 shrink-0 items-center justify-between gap-4 border-b border-border px-6 pl-18 lg:pl-8">
          <div>
            <h1 className="text-sm font-medium">学习对话</h1>
            <p className="mt-1 text-[10px] text-muted-foreground">
              公考知识库已接入
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => create.mutate('')}
            disabled={create.isPending}
          >
            <Plus />
            新对话
          </Button>
        </header>
        {error && (
          <p role="alert" className="p-4 text-sm text-destructive">
            {error}
          </p>
        )}
        {chatId ? (
          conversation.data ? (
            <ChatPane
              key={chatId}
              id={chatId}
              conversation={conversation.data}
              models={models.data}
              initialPrompt={firstPrompt}
              onInitialSent={() => setFirstPrompt('')}
            />
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
              {conversation.isError
                ? '无法加载这段对话，请重新选择。'
                : '正在打开对话…'}
            </div>
          )
        ) : (
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-6 py-14 md:px-12">
            <div className="mx-auto w-full max-w-2xl">
              <span className="mb-8 grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                <BookOpen size={25} strokeWidth={1.5} />
              </span>
              <p className="mb-3 text-xs text-muted-foreground">
                从一个好问题开始
              </p>
              <h2 className="mb-5 text-3xl leading-snug font-medium tracking-tight md:text-5xl">
                今天，想学懂什么？
              </h2>
              <p className="mb-10 max-w-lg text-sm leading-8 text-muted-foreground">
                讲一个考点、找一道真题，或是拆解一篇申论。导师会先查资料，再和你一起把问题理清楚。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {questions.map((question, index) => (
                  <button
                    key={question}
                    onClick={() => create.mutate(question)}
                    disabled={
                      create.isPending || !models.data?.providers.length
                    }
                    className={`group flex items-center justify-between gap-4 rounded-2xl border p-5 text-left text-xs leading-6 transition-colors disabled:opacity-50 ${['border-emerald-100 bg-emerald-50 hover:bg-emerald-100', 'border-amber-100 bg-amber-50 hover:bg-amber-100', 'border-rose-100 bg-rose-50 hover:bg-rose-100', 'border-lime-100 bg-lime-50 hover:bg-lime-100'][index]}`}
                  >
                    {question}
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </button>
                ))}
              </div>
              {models.data && !models.data.providers.length && (
                <p
                  role="status"
                  className="mt-8 rounded-xl bg-secondary p-4 text-xs leading-7 text-muted-foreground"
                >
                  AI
                  模型尚未配置。管理员可在“模型配置”中添加连接；现在可以先进入知识库阅读资料。
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
function ChatPane({
  id,
  conversation,
  models,
  initialPrompt,
  onInitialSent,
}: {
  id: string
  conversation: Conversation & { messages: ChatMessage[] }
  models?: Models
  initialPrompt: string
  onInitialSent: () => void
}) {
  const client = useQueryClient(),
    [input, setInput] = useState(''),
    [selection, setSelection] = useState('')
  const submitted = useRef(false),
    bottom = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    stick = useRef(true)
  const choices =
    models?.providers.flatMap((provider) =>
      provider.models.map((model) => ({
        key: JSON.stringify([provider.id, model]),
        label: `${provider.name} / ${model}`,
      })),
    ) ?? []
  const preferred = JSON.stringify([
    conversation.providerId ?? models?.defaultProviderId,
    conversation.modelId ?? models?.defaultModelId,
  ])
  const selected =
    selection ||
    choices.find((choice) => choice.key === preferred)?.key ||
    choices[0]?.key ||
    ''
  const [providerId, modelId] = selected
    ? (JSON.parse(selected) as [string, string])
    : []
  const { messages, sendMessage, status, stop, error } = useChat<StudyMessage>({
    id,
    transport,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: [{ type: 'text', text: message.content }],
      metadata: { sources: message.sources },
    })),
    onFinish: () => {
      void client.invalidateQueries({ queryKey: ['me'] })
      void client.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
  const busy = status === 'submitted' || status === 'streaming'
  function send(text: string) {
    if (!text.trim() || busy || !selected) return
    stick.current = true
    setInput('')
    void sendMessage(
      { text },
      { body: { conversationId: id, providerId, modelId } },
    )
  }
  useEffect(() => {
    if (initialPrompt && selected && !submitted.current) {
      submitted.current = true
      send(initialPrompt)
      onInitialSent()
    }
  }, [initialPrompt, selected])
  const lastText = messages
    .at(-1)
    ?.parts.filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
  useEffect(() => {
    if (stick.current)
      bottom.current?.scrollIntoView({ block: 'end', behavior: 'instant' })
  }, [lastText, status, messages.length])
  return (
    <>
      <div
        ref={scroll}
        onScroll={() => {
          const el = scroll.current!
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140
        }}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-9 md:px-12"
      >
        <div className="mx-auto max-w-3xl space-y-10">
          {!messages.length && (
            <p className="pt-12 text-center text-sm text-muted-foreground">
              把你的问题写下来，我们一起找到答案。
            </p>
          )}
          {messages.map((message) => (
            <article
              key={message.id}
              className={
                message.role === 'user'
                  ? 'ml-auto max-w-xl rounded-2xl bg-primary/7 px-5 py-4'
                  : 'max-w-full'
              }
            >
              <p className="mb-3 text-[11px] text-muted-foreground">
                {message.role === 'user' ? '你' : '考公学习导师'}
              </p>
              {message.parts.map((part, i) =>
                part.type === 'text' ? (
                  <Markdown key={i}>{part.text}</Markdown>
                ) : part.type.startsWith('tool-') ? (
                  <div
                    key={i}
                    className="my-2 flex items-center gap-2 text-[11px] text-muted-foreground"
                  >
                    <Check size={12} />
                    {toolLabels[part.type] ?? '查阅知识库'}
                  </div>
                ) : null,
              )}
              {Boolean(message.metadata?.sources?.length) && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {message.metadata?.sources?.map((source) => (
                    <a
                      key={source.id}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex max-w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
                    >
                      <BookOpen size={12} />
                      <span className="truncate">{source.title}</span>
                      {source.issue && (
                        <span className="text-destructive">有疑点</span>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
          {busy && (
            <p
              role="status"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Loader2
                size={13}
                className="animate-spin motion-reduce:animate-none"
              />
              {status === 'submitted' ? '正在查找资料…' : '正在整理回答…'}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-destructive/5 p-4 text-sm leading-7 text-destructive"
            >
              {error.message || '回答未能完成，请稍后重试。'}
            </p>
          )}
          <div ref={bottom} />
        </div>
      </div>
      <div className="shrink-0 px-4 pt-2 pb-5 md:px-10">
        <div className="mx-auto max-w-3xl">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              send(input)
            }}
            className="rounded-2xl border border-border bg-background p-3 shadow-sm focus-within:ring-2 focus-within:ring-primary/15"
          >
            <label htmlFor="chat-input" className="sr-only">
              你的学习问题
            </label>
            <textarea
              id="chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (
                    !event.nativeEvent.isComposing &&
                    event.nativeEvent.keyCode !== 229
                  )
                    event.currentTarget.form?.requestSubmit()
                }
              }}
              rows={2}
              maxLength={12000}
              placeholder="问一个考点，或继续追问…"
              className="max-h-40 min-h-18 w-full resize-y border-0 bg-transparent px-2 py-2 text-sm leading-7 outline-none"
            />
            <div className="flex items-center justify-between gap-3">
              <label className="max-w-4/5 min-w-0">
                <span className="sr-only">选择学习模型</span>
                <Select
                  value={selected}
                  onChange={(event) => setSelection(event.target.value)}
                  disabled={busy}
                  className="h-8 max-w-96 border-0 bg-secondary text-[11px]"
                >
                  {choices.length ? (
                    choices.map((choice) => (
                      <option key={choice.key} value={choice.key}>
                        {choice.label}
                      </option>
                    ))
                  ) : (
                    <option value="">管理员尚未配置模型</option>
                  )}
                </Select>
              </label>
              {busy ? (
                <Button
                  type="button"
                  size="icon"
                  aria-label="停止生成"
                  onClick={() => {
                    void stop()
                  }}
                >
                  <Square size={14} fill="currentColor" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  aria-label="发送问题"
                  disabled={!input.trim() || !selected}
                >
                  <ArrowUp />
                </Button>
              )}
            </div>
          </form>
          <div className="mt-3 flex items-center justify-between gap-4 text-[10px] text-muted-foreground">
            <p>回答由 AI 辅助生成，请结合原文核对。</p>
            <button
              type="button"
              onClick={() =>
                bottom.current?.scrollIntoView({ behavior: 'smooth' })
              }
              className="flex shrink-0 items-center gap-1"
            >
              回到底部
              <ArrowDown size={11} />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
