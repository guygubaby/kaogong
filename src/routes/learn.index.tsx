import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Loader2,
  Plus,
  Square,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { z } from 'zod'
import { errorText, http } from '@/lib/client'
import type { ChatMessage, Conversation } from '@/lib/shared'
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
type StudyMessage = UIMessage<{ totalTokens?: number }>
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
  'tool-loadSkill': '正在准备学习思路…',
  'tool-searchKnowledge': '正在查找相关考点…',
  'tool-readDocument': '正在阅读知识点…',
  'tool-knownIssues': '正在核对题目细节…',
  'tool-readOriginal': '正在核对公式与细节…',
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
    [error, setError] = useState(''),
    [deleting, setDeleting] = useState<Conversation | null>(null)
  const cancel = useRef<(() => Promise<void>) | null>(null)
  const deleteTrigger = useRef<HTMLButtonElement>(null)
  const newChatButton = useRef<HTMLButtonElement>(null)
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
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (id === chatId) await cancel.current?.()
      return http.delete(`conversations/${id}`)
    },
    onSuccess: async (_response, id) => {
      if (id === chatId) {
        setFirstPrompt('')
        await navigate({ to: '/learn', search: {} })
      }
      client.removeQueries({ queryKey: ['conversation', id] })
      await client.invalidateQueries({ queryKey: ['conversations'] })
      setDeleting(null)
    },
  })
  function confirmDelete(item: Conversation, trigger: HTMLButtonElement) {
    remove.reset()
    deleteTrigger.current = trigger
    setDeleting(item)
  }
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
            <div
              key={item.id}
              className={`group flex items-center rounded-xl ${chatId === item.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/70'}`}
            >
              <button
                type="button"
                onClick={() => {
                  setFirstPrompt('')
                  void navigate({ to: '/learn', search: { chat: item.id } })
                }}
                className="min-w-0 flex-1 truncate px-3 py-3 text-left text-xs"
                title={item.title}
              >
                {item.title}
              </button>
              <button
                type="button"
                aria-label={`删除会话：${item.title}`}
                title="删除会话"
                onClick={(event) => confirmDelete(item, event.currentTarget)}
                className="mr-1 grid size-8 shrink-0 place-items-center rounded-lg opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-destructive/8 hover:text-destructive [@media(hover:none)]:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
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
          <div className="flex items-center gap-2">
            {conversation.data && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="删除当前会话"
                title="删除当前会话"
                onClick={(event) => {
                  if (conversation.data)
                    confirmDelete(conversation.data, event.currentTarget)
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            )}
            <Button
              ref={newChatButton}
              size="sm"
              variant="outline"
              onClick={() => create.mutate('')}
              disabled={create.isPending}
            >
              <Plus />
              新对话
            </Button>
          </div>
        </header>
        {Boolean(conversations.data?.length) && (
          <div className="border-b border-border px-5 py-3 xl:hidden">
            <Select
              aria-label="历史学习对话"
              value={chatId ?? ''}
              placeholder="选择之前的学习对话"
              size="compact"
              options={(conversations.data ?? []).map((item) => ({
                value: item.id,
                label: item.title,
              }))}
              onValueChange={(id) => {
                setFirstPrompt('')
                void navigate({ to: '/learn', search: { chat: id } })
              }}
            />
          </div>
        )}
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
              cancel={cancel}
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
                    className={`group flex items-center justify-between gap-4 rounded-2xl border p-5 text-left text-xs leading-6 transition-colors disabled:opacity-50 ${['border-violet-100 bg-violet-50 hover:bg-violet-100', 'border-sky-100 bg-sky-50 hover:bg-sky-100', 'border-emerald-100 bg-emerald-50 hover:bg-emerald-100', 'border-amber-100 bg-amber-50 hover:bg-amber-100'][index]}`}
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
      <Dialog.Root
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-60 bg-foreground/20 backdrop-blur-sm" />
          <Dialog.Content
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              ;(deleteTrigger.current?.isConnected
                ? deleteTrigger.current
                : newChatButton.current
              )?.focus()
            }}
            className="fixed top-1/2 left-1/2 z-70 w-[calc(100%_-_2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border bg-background p-6 shadow-xl outline-none"
          >
            <span
              aria-hidden="true"
              className="mb-5 grid size-11 place-items-center rounded-2xl bg-destructive/8 text-destructive"
            >
              <Trash2 size={20} />
            </span>
            <Dialog.Title className="text-lg font-semibold">
              删除这段会话？
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-sm leading-7 break-words text-muted-foreground">
              将删除“{deleting?.title}
              ”及全部消息，删除后无法恢复，已使用的额度不会返还。
            </Dialog.Description>
            {remove.isError && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {errorText(remove.error)}
              </p>
            )}
            <div className="mt-7 flex justify-end gap-3">
              <Dialog.Close asChild>
                <Button variant="outline" disabled={remove.isPending}>
                  取消
                </Button>
              </Dialog.Close>
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => {
                  if (deleting) remove.mutate(deleting.id)
                }}
              >
                {remove.isPending && (
                  <Loader2 className="animate-spin motion-reduce:animate-none" />
                )}
                {remove.isPending ? '正在删除…' : '确认删除'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
function ChatPane({
  id,
  conversation,
  models,
  initialPrompt,
  onInitialSent,
  cancel,
}: {
  id: string
  conversation: Conversation & { messages: ChatMessage[] }
  models?: Models
  initialPrompt: string
  onInitialSent: () => void
  cancel: RefObject<(() => Promise<void>) | null>
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
    })),
    onFinish: () => {
      void client.invalidateQueries({ queryKey: ['me'] })
      void client.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
  const busy = status === 'submitted' || status === 'streaming'
  useImperativeHandle(cancel, () => stop, [stop])
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
        className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 md:px-10"
      >
        <div className="mx-auto max-w-4xl space-y-7 sm:space-y-9">
          {!messages.length && (
            <p className="pt-12 text-center text-sm text-muted-foreground">
              把你的问题写下来，我们一起找到答案。
            </p>
          )}
          {messages.map((message) => {
            const isUser = message.role === 'user'
            const text = message.parts
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join('\n\n')
            const lastTool = message.parts.findLast((part) =>
              part.type.startsWith('tool-'),
            )
            const isWriting = busy && message.id === messages.at(-1)?.id
            if (!isUser && !text && !isWriting) return null
            return (
              <article
                key={message.id}
                className={
                  isUser
                    ? 'ml-auto w-fit max-w-5/6'
                    : 'flex max-w-full items-start gap-2.5 sm:gap-4'
                }
              >
                <span className="sr-only">
                  {isUser ? '你' : '考公学习导师'}
                </span>
                {!isUser && (
                  <span
                    aria-hidden="true"
                    className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-brand/65 text-brand-foreground sm:size-9"
                  >
                    <Sparkles size={18} strokeWidth={1.8} />
                  </span>
                )}
                <div
                  className={
                    isUser
                      ? 'rounded-3xl rounded-tr-lg bg-message px-5 py-3.5 text-foreground sm:px-6'
                      : 'max-w-[80ch] min-w-0 flex-1 rounded-3xl rounded-tl-lg bg-assistant px-5 py-5 sm:px-7 sm:py-6'
                  }
                >
                  {text && <Markdown>{text}</Markdown>}
                  {!isUser && isWriting && (
                    <p
                      role="status"
                      className={`${text ? 'mt-4' : ''} flex items-center gap-2 text-xs text-muted-foreground`}
                    >
                      <Loader2
                        size={13}
                        className="animate-spin motion-reduce:animate-none"
                      />
                      {lastTool && !text
                        ? (toolLabels[lastTool.type] ?? '正在整理学习要点…')
                        : '正在整理回答…'}
                    </p>
                  )}
                </div>
              </article>
            )
          })}
          {busy && messages.at(-1)?.role !== 'assistant' && (
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
        <div className="mx-auto max-w-4xl">
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
              <div className="max-w-4/5 min-w-0">
                <Select
                  aria-label="选择学习模型"
                  value={selected}
                  onValueChange={setSelection}
                  disabled={busy || !choices.length}
                  placeholder="管理员尚未配置模型"
                  size="compact"
                  className="max-w-96"
                  options={choices.map((choice) => ({
                    value: choice.key,
                    label: choice.label,
                  }))}
                />
              </div>
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
