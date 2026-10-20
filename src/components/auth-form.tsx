import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowUpRight,
  BookOpen,
  ChartNoAxesCombined,
  Layers3,
  Loader2,
  Sparkles,
  Check,
} from 'lucide-react'
import { useState } from 'react'
import { authClient } from '@/lib/client'
import { Input } from './ui/input'
import { Button } from './ui/button'

const schema = z.object({
  name: z.string().max(50),
  email: z.string().email('请填写有效的邮箱地址'),
  password: z
    .string()
    .min(10, '密码至少需要 10 个字符')
    .max(128, '密码最多 128 个字符'),
})
export function AuthForm({ register: registering }: { register: boolean }) {
  const navigate = useNavigate(),
    [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  })
  return (
    <main className="min-h-svh bg-background">
      <header className="mx-auto flex h-24 max-w-6xl items-center justify-between px-6 md:px-10">
        <Link to="/" className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-brand text-brand-foreground">
            <BookOpen size={22} />
          </span>
          <span className="text-xl font-semibold tracking-wider">
            考公
            <span className="ml-3 hidden text-xs font-normal tracking-normal text-muted-foreground sm:inline">
              一起，把问题学明白。
            </span>
          </span>
        </Link>
        <span className="rounded-full bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
          专注公考 · 长期成长
        </span>
      </header>
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-12 md:min-h-[calc(100svh-7rem)] md:grid-cols-2 md:gap-20 md:px-10">
        <aside className="relative hidden overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-100 via-sky-50 to-emerald-50 p-9 md:block">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs text-primary">
            <Sparkles size={14} />
            知识库 × AI 学习导师
          </span>
          <h1 className="text-4xl leading-normal font-semibold tracking-tight">
            每一个问题，
            <br />
            都能成为进步的起点。
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-8 text-slate-600">
            系统讲义、真题解析、AI 追问。
            <br />
            每天学一点，让进步看得见。
          </p>
          <div className="mt-10 space-y-3">
            <div className="mr-8 flex items-center gap-4 rounded-2xl border border-white bg-white/85 p-5 shadow-sm">
              <span className="grid size-11 place-items-center rounded-xl bg-violet-100 text-violet-600">
                <BookOpen size={23} />
              </span>
              <div>
                <p className="text-sm font-medium">申论 · 言之有物</p>
                <p className="mt-1 text-xs text-slate-500">
                  读懂材料，组织要点，写清观点。
                </p>
              </div>
              <Check className="ml-auto size-4 text-violet-500" />
            </div>
            <div className="ml-8 flex items-center gap-4 rounded-2xl border border-white bg-white/85 p-5 shadow-sm">
              <span className="grid size-11 place-items-center rounded-xl bg-sky-100 text-sky-600">
                <ChartNoAxesCombined size={23} />
              </span>
              <div>
                <p className="text-sm font-medium">资料分析 · 读懂数据</p>
                <p className="mt-1 text-xs text-slate-500">
                  从数据关系，找到解题方法。
                </p>
              </div>
              <Check className="ml-auto size-4 text-sky-500" />
            </div>
            <div className="mr-8 flex items-center gap-4 rounded-2xl border border-white bg-white/85 p-5 shadow-sm">
              <span className="grid size-11 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
                <Layers3 size={23} />
              </span>
              <div>
                <p className="text-sm font-medium">判断推理 · 找到规律</p>
                <p className="mt-1 text-xs text-slate-500">
                  把观察、归纳与验证连起来。
                </p>
              </div>
              <Check className="ml-auto size-4 text-emerald-500" />
            </div>
          </div>
          <p className="mt-8 text-xs text-slate-500">
            行测 · 申论 · 综应 · 公安专业 · 时政省情
          </p>
        </aside>
        <div className="mx-auto w-full max-w-sm py-8">
          <p className="mb-5 text-xs text-muted-foreground">
            {registering ? '开启你的学习旅程' : '继续上一次的进步'}
          </p>
          <h2 className="mb-3 text-4xl font-medium tracking-tight">
            {registering ? '免费开始学习。' : '欢迎回来。'}
          </h2>
          <p className="mb-10 text-sm text-muted-foreground">
            {registering
              ? '注册后，即可阅读知识库并向 AI 导师提问。'
              : '登录账号，继续你的知识积累。'}
          </p>
          <form
            className="space-y-5"
            onSubmit={handleSubmit(async (values) => {
              setError('')
              if (registering && !values.name.trim()) {
                setError('请填写你的称呼')
                return
              }
              try {
                const result = registering
                  ? await authClient.signUp.email({
                      ...values,
                      name: values.name.trim(),
                    })
                  : await authClient.signIn.email({
                      email: values.email,
                      password: values.password,
                    })
                if (result.error) {
                  setError(
                    result.error.code === 'INVALID_EMAIL_OR_PASSWORD'
                      ? '邮箱或密码不正确'
                      : result.error.code === 'USER_ALREADY_EXISTS'
                        ? '这个邮箱已经注册，请直接登录'
                        : result.error.code === 'USER_BANNED'
                          ? '账号已停用，请联系管理员'
                          : registering
                            ? '注册未成功，请检查信息或稍后重试'
                            : '登录未成功，请检查信息或稍后重试',
                  )
                  return
                }
                await navigate({ to: '/learn' })
              } catch {
                setError('连接失败，请检查网络后重试')
              }
            })}
          >
            {registering && (
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm">
                  你的称呼
                </label>
                <Input
                  id="name"
                  autoComplete="nickname"
                  placeholder="怎么称呼你？"
                  {...register('name')}
                />
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm">
                邮箱
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="你的邮箱地址"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm">
                密码
              </label>
              <Input
                id="password"
                type="password"
                autoComplete={registering ? 'new-password' : 'current-password'}
                placeholder={registering ? '至少 10 个字符' : '输入你的密码'}
                aria-invalid={Boolean(errors.password)}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-destructive/5 p-3 text-sm leading-6 text-destructive"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="mt-3 w-full"
              size="lg"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
              ) : (
                <>
                  {registering ? '注册并开始学习' : '登录'}
                  <ArrowUpRight />
                </>
              )}
            </Button>
          </form>
          <p className="mt-7 text-center text-sm text-muted-foreground">
            {registering ? '已经有账号？' : '还没有账号？'}{' '}
            <Link
              to={registering ? '/login' : '/register'}
              title={registering ? '欢迎回来' : '开始学习'}
              className="text-foreground underline underline-offset-4"
            >
              {registering ? '去登录' : '免费注册'}
            </Link>
          </p>
          <p className="mt-12 text-center text-xs leading-6 text-muted-foreground">
            专注当下，认真积累每一点进步
            <br />
            每日额度按中国标准时间重置
          </p>
        </div>
      </div>
    </main>
  )
}
