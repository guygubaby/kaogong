import { z } from 'zod'

export const DEFAULT_DAILY_TOKENS = 50_000_000
export const DEFAULT_REQUESTS_PER_MINUTE = 30
export const MAX_OUTPUT_TOKENS = 128_000
export const MAX_AGENT_STEPS = 6
export const providerInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  protocol: z.enum(['openai', 'responses', 'anthropic']),
  baseUrl: z.string().url().max(1000),
  apiKey: z.string().max(4096).optional(),
  enabled: z.boolean(),
  models: z.array(z.string().min(1).max(200)).max(1000),
  maxOutputTokens: z.number().int().min(256).max(MAX_OUTPUT_TOKENS),
})
export type ProviderInput = z.infer<typeof providerInput>
export type PublicProvider = Omit<ProviderInput, 'apiKey' | 'id'> & {
  id: string
  keyPreview: string
}
export type KnowledgeItem = {
  id: string
  title: string
  module: string
  kind: string
  issue: boolean
}
export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}
export type Conversation = {
  id: string
  title: string
  updatedAt: string
  providerId: string | null
  modelId: string | null
}
export type BudgetSnapshot = {
  day: string
  used: number
  reserved: number
  limit: number
  remaining: number
  requestsPerMinute: number
}
export type Me = {
  user: {
    id: string
    name: string
    email: string
    role: string
    dailyTokenLimit: number
    requestsPerMinute: number
  }
  budget: BudgetSnapshot
}
export const cnNumber = (number: number) =>
  new Intl.NumberFormat('zh-CN').format(number)
