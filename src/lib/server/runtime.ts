import type { UserBudget } from './budget'
import { AsyncLocalStorage } from 'node:async_hooks'

export const requestRuntime = new AsyncLocalStorage<{
  env: Env
  ctx: ExecutionContext
}>()
export function runtime() {
  const value = requestRuntime.getStore()
  if (!value) throw new Error('缺少请求上下文')
  return value
}

export function budgetFor(name: string) {
  const namespace = runtime().env.BUDGET as DurableObjectNamespace<UserBudget>
  return namespace.getByName(name)
}
