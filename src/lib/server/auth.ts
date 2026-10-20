import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { admin } from 'better-auth/plugins'
import { database } from './db'
import { runtime } from './runtime'
import { HttpError } from './http'

export function auth() {
  const { env } = runtime()
  return betterAuth({
    appName: '考公',
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(database(), {
      provider: 'sqlite',
      transaction: false,
    }),
    trustedOrigins: [env.APP_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        dailyTokenLimit: {
          type: 'number',
          defaultValue: 50_000_000,
          input: false,
        },
        requestsPerMinute: { type: 'number', defaultValue: 30, input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    plugins: [admin()],
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    rateLimit: { enabled: true, window: 60, max: 30 },
  })
}

export async function requireUser(request: Request, administrator = false) {
  const session = await auth().api.getSession({ headers: request.headers })
  if (!session) throw new HttpError(401, 'UNAUTHENTICATED', '请先登录')
  const user = await database().user.findUnique({
    where: { id: session.user.id },
  })
  if (!user || user.banned)
    throw new HttpError(403, 'ACCOUNT_DISABLED', '此账号已停用，请联系管理员')
  if (administrator && user.role !== 'admin')
    throw new HttpError(403, 'FORBIDDEN', '仅管理员可以操作')
  return user
}
