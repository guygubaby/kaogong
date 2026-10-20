import { bindings, defineConfig, exports as workerExports } from 'cf/config'

export default defineConfig(({ mode }) => ({
  accountId: 'dffac4f6d50c0e96731800e04a9c50fb',
  worker: {
    name: 'kaogong',
    entrypoint: './src/worker.ts',
    compatibilityDate: mode === 'development' ? '2026-10-19' : '2026-10-20',
    compatibilityFlags: ['nodejs_compat'],
    workersDev: true,
    domains: ['kaogong.guygubaby.top'],
    observability: {
      enabled: true,
      traces: { enabled: true },
      headSamplingRate: 0.1,
    },
    exports: { UserBudget: workerExports.durableObject({ storage: 'sqlite' }) },
    env: {
      DB: bindings.d1({ name: 'kaogong-db' }),
      KNOWLEDGE: bindings.r2({ name: 'kaogong-knowledge' }),
      BUDGET: bindings.durableObject({
        worker: 'kaogong',
        exportName: 'UserBudget',
      }),
      APP_URL: bindings.text('https://kaogong.guygubaby.top'),
      BETTER_AUTH_SECRET: bindings.secret(),
      ENCRYPTION_KEY: bindings.secret(),
      BOOTSTRAP_TOKEN: bindings.secret(),
    },
  },
}))
