import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import {
  Check,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Server,
} from 'lucide-react'
import { toast } from 'sonner'
import { errorText, http } from '@/lib/client'
import {
  providerInput,
  type ProviderInput,
  type PublicProvider,
} from '@/lib/shared'
import { PageHeading } from '@/components/app/shell'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'

export const Route = createFileRoute('/learn/admin/providers')({
  component: Providers,
})
type Settings = {
  defaultProviderId: string | null
  defaultModelId: string | null
  registrationEnabled: boolean
}
const empty: ProviderInput = {
  name: '',
  protocol: 'openai',
  baseUrl: '',
  apiKey: '',
  enabled: true,
  models: [],
  maxOutputTokens: 128000,
}
function Providers() {
  const client = useQueryClient(),
    [editing, setEditing] = useState<PublicProvider | null>(null),
    [available, setAvailable] = useState<string[]>([]),
    [testingModel, setTestingModel] = useState(''),
    [manualModel, setManualModel] = useState(''),
    [filter, setFilter] = useState(''),
    [result, setResult] = useState('')
  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: () => http.get('admin/providers').json<PublicProvider[]>(),
  })
  const settings = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => http.get('admin/settings').json<Settings>(),
  })
  const form = useForm<ProviderInput>({
    resolver: zodResolver(providerInput),
    defaultValues: empty,
  })
  const selected = form.watch('models')
  const save = useMutation({
    mutationFn: (body: ProviderInput) =>
      http.post('admin/providers', { json: body }).json<PublicProvider>(),
    onSuccess: (provider) => {
      setEditing(provider)
      form.reset({ ...provider, apiKey: '' })
      toast.success('Provider 已保存')
      void client.invalidateQueries({ queryKey: ['providers'] })
      void client.invalidateQueries({ queryKey: ['models'] })
    },
    onError: (error) => toast.error(errorText(error)),
  })
  const discover = useMutation({
    mutationFn: () =>
      http
        .post('admin/providers/discover', { json: form.getValues() })
        .json<{ models: string[] }>(),
    onSuccess: ({ models }) => {
      setAvailable(models)
      setTestingModel(models[0] ?? '')
      setResult(
        `已获取 ${models.length} 个可用模型，请勾选允许学习者使用的模型。`,
      )
    },
    onError: (error) => setResult(errorText(error)),
  })
  const test = useMutation({
    mutationFn: () =>
      http
        .post('admin/providers/test', {
          json: { ...form.getValues(), modelId: testingModel },
        })
        .json<{ ok: boolean; message: string; latencyMs: number }>(),
    onSuccess: (data) => {
      setResult(`连接成功 · ${data.latencyMs} 毫秒 · ${data.message}`)
      void client.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (error) => setResult(errorText(error)),
  })
  const updateSettings = useMutation({
    mutationFn: (body: Settings) =>
      http.patch('admin/settings', { json: body }).json(),
    onSuccess: () => {
      toast.success('站点设置已保存')
      void client.invalidateQueries({ queryKey: ['admin-settings'] })
      void client.invalidateQueries({ queryKey: ['models'] })
    },
    onError: (error) => toast.error(errorText(error)),
  })
  function edit(provider: PublicProvider | null) {
    setEditing(provider)
    form.reset(provider ? { ...provider, apiKey: '' } : empty)
    setAvailable(provider?.models ?? [])
    setTestingModel(provider?.models[0] ?? '')
    setResult('')
    setFilter('')
  }
  return (
    <main className="mx-auto max-w-6xl px-6 py-20 md:px-10 lg:py-12">
      <PageHeading
        eyebrow="管理工作台"
        title="连接你的学习模型。"
        description="管理员统一配置连接、开放模型与默认模型。密钥仅在服务器端使用，保存后不会返回浏览器。"
        action={
          <Button variant="outline" onClick={() => edit(null)}>
            <Plus />
            新增连接
          </Button>
        }
      />
      <div className="grid gap-8 xl:grid-cols-[240px_1fr]">
        <div className="space-y-3">
          {providers.data?.map((provider) => (
            <button
              key={provider.id}
              onClick={() => edit(provider)}
              className={`w-full rounded-2xl border p-5 text-left ${editing?.id === provider.id ? 'border-primary bg-primary/3' : 'border-border'}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <Server size={18} className="text-muted-foreground" />
                <span
                  className={`size-1.5 rounded-full ${provider.enabled ? 'bg-success' : 'bg-muted-foreground'}`}
                />
              </div>
              <p className="text-sm font-medium">{provider.name}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {provider.models.length} 个模型 · {provider.keyPreview}
              </p>
            </button>
          ))}
          {providers.data?.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-5 text-xs leading-7 text-muted-foreground">
              还没有连接。填写右侧配置，拉取模型并测试后保存。
            </div>
          )}
          <div className="rounded-2xl bg-secondary p-5 text-[11px] leading-7 text-muted-foreground">
            支持 OpenAI Chat、Responses 与 Anthropic
            协议。请求会携带稳定的会话标识；上游重定向会被拒绝，请填写最终 API
            地址。
          </div>
        </div>
        <form
          onSubmit={form.handleSubmit((body) => save.mutate(body))}
          className="min-w-0 space-y-6 rounded-2xl border border-border p-5 md:p-8"
        >
          <h2 className="text-lg font-medium">
            {editing ? '编辑连接' : '新增连接'}
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="连接名称" id="provider-name">
              <Input
                id="provider-name"
                placeholder="例如：学习主模型"
                {...form.register('name')}
              />
            </Field>
            <Field label="API 协议" id="provider-protocol">
              <Select id="provider-protocol" {...form.register('protocol')}>
                <option value="openai">OpenAI 兼容 · Chat Completions</option>
                <option value="responses">OpenAI · Responses</option>
                <option value="anthropic">Anthropic 兼容 · Messages</option>
              </Select>
            </Field>
          </div>
          <Field label="API 基础地址" id="provider-url">
            <Input
              id="provider-url"
              type="url"
              placeholder="https://api.example.com/v1"
              {...form.register('baseUrl')}
            />
            <p className="mt-2 text-[11px] leading-6 text-muted-foreground">
              填写包含版本或网关前缀的基础地址。模型列表请求会追加 /models。HTTP
              连接会明文传输密钥与问题，请仅使用明确授权的网关。
            </p>
          </Field>
          <Field
            label={
              editing
                ? `API 密钥（已保存 ${editing.keyPreview}，留空则保留）`
                : 'API 密钥'
            }
            id="provider-key"
          >
            <Input
              id="provider-key"
              type="password"
              autoComplete="off"
              placeholder={editing ? '留空保留原密钥' : '输入 API 密钥'}
              {...form.register('apiKey')}
            />
          </Field>
          <div className="flex flex-wrap items-end gap-5">
            <Field label="最大输出 tokens" id="max-output">
              <Input
                id="max-output"
                type="number"
                min={256}
                max={128000}
                {...form.register('maxOutputTokens', { valueAsNumber: true })}
              />
            </Field>
            <label className="flex h-12 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                {...form.register('enabled')}
              />
              向学习者开放
            </label>
          </div>
          <div className="border-t border-border pt-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-sm font-medium">
                选择开放模型{' '}
                <span className="ml-2 text-xs text-muted-foreground">
                  已选 {selected.length} 个
                </span>
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={discover.isPending}
                onClick={() => {
                  setResult('')
                  discover.mutate()
                }}
              >
                {discover.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
                获取 /v1/models
              </Button>
            </div>
            {available.length > 5 && (
              <Input
                aria-label="筛选模型"
                placeholder="筛选模型 ID…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="mb-3 h-10"
              />
            )}
            <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
              {available
                .filter((model) =>
                  model.toLowerCase().includes(filter.toLowerCase()),
                )
                .map((model) => (
                  <label
                    key={model}
                    className="flex cursor-pointer items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0"
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-primary"
                      checked={selected.includes(model)}
                      onChange={(event) =>
                        form.setValue(
                          'models',
                          event.target.checked
                            ? [...selected, model]
                            : selected.filter((value) => value !== model),
                        )
                      }
                    />
                    <span className="min-w-0 text-xs break-all">{model}</span>
                  </label>
                ))}
              {!available.length && (
                <p className="p-5 text-xs text-muted-foreground">
                  拉取模型列表，或手动添加网关支持的模型 ID。
                </p>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                aria-label="手动添加模型 ID"
                value={manualModel}
                onChange={(event) => setManualModel(event.target.value)}
                placeholder="手动添加模型 ID"
                className="h-10"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!manualModel.trim()}
                onClick={() => {
                  const model = manualModel.trim()
                  setAvailable([...new Set([...available, model])])
                  form.setValue('models', [...new Set([...selected, model])])
                  setTestingModel(model)
                  setManualModel('')
                }}
              >
                添加
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-6">
            <Field label="连接测试模型" id="test-model">
              <Select
                id="test-model"
                value={testingModel}
                onChange={(event) => setTestingModel(event.target.value)}
                className="max-w-80"
              >
                <option value="">请选择模型</option>
                {available.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="button"
              variant="outline"
              disabled={!testingModel || test.isPending}
              onClick={() => {
                setResult('')
                test.mutate()
              }}
            >
              {test.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FlaskConical />
              )}
              测试连接
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              保存连接
            </Button>
          </div>
          {result && (
            <p
              role="status"
              className="rounded-xl bg-secondary p-4 text-xs leading-7"
            >
              {result}
            </p>
          )}
          {Object.keys(form.formState.errors).length > 0 && (
            <p role="alert" className="text-xs text-destructive">
              请检查连接名称、HTTPS 地址和输出上限是否填写正确。
            </p>
          )}
        </form>
      </div>
      {settings.data && (
        <section className="mt-10 rounded-2xl border border-border p-6 md:p-8">
          <h2 className="mb-6 text-lg font-medium">站点默认设置</h2>
          <div className="flex flex-wrap items-end gap-5">
            <Field label="默认学习模型" id="default-model">
              <Select
                id="default-model"
                className="max-w-110"
                value={JSON.stringify([
                  settings.data.defaultProviderId,
                  settings.data.defaultModelId,
                ])}
                onChange={(event) => {
                  const [defaultProviderId, defaultModelId] = JSON.parse(
                    event.target.value,
                  ) as [string, string]
                  updateSettings.mutate({
                    ...settings.data!,
                    defaultProviderId,
                    defaultModelId,
                  })
                }}
              >
                <option value="[null,null]">尚未选择默认模型</option>
                {providers.data
                  ?.filter((provider) => provider.enabled)
                  .flatMap((provider) =>
                    provider.models.map((model) => (
                      <option
                        key={`${provider.id}:${model}`}
                        value={JSON.stringify([provider.id, model])}
                      >
                        {provider.name} / {model}
                      </option>
                    )),
                  )}
              </Select>
            </Field>
            <label className="flex h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={settings.data.registrationEnabled}
                onChange={(event) =>
                  updateSettings.mutate({
                    ...settings.data!,
                    registrationEnabled: event.target.checked,
                  })
                }
              />
              开放新用户注册
            </label>
          </div>
        </section>
      )}
    </main>
  )
}
export function Field({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <label htmlFor={id} className="block text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
