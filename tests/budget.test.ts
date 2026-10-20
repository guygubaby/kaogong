import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { UserBudget } from '../src/lib/server/budget'

const databases: DatabaseSync[] = []
function fixture() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  const sql = {
    exec(query: string, ...params: (string | number)[]) {
      const statement = db.prepare(query)
      const rows = /^SELECT/i.test(query.trim())
        ? statement.all(...params)
        : (statement.run(...params), [])
      return {
        toArray: () => rows,
        one: () => {
          if (rows.length !== 1) throw new Error('Expected one result')
          return rows[0]
        },
      }
    },
  }
  const state = { storage: { sql } }
  const budget: UserBudget = Reflect.construct(UserBudget, [state, {}])
  return {
    budget,
    restart: (): UserBudget => Reflect.construct(UserBudget, [state, {}]),
  }
}
afterEach(() => databases.splice(0).forEach((db) => db.close()))
describe('持久化限流与额度', () => {
  it('第 31 次调用被拒绝，滚动窗口到期后恢复', () => {
    const { budget } = fixture()
    for (let i = 0; i < 30; i++) expect(budget.rate(30, 100_000)).toBe(true)
    expect(budget.rate(30, 100_001)).toBe(false)
    expect(budget.rate(30, 160_000)).toBe(true)
  })
  it('预留阻止并发超额，结算幂等并在实例重建后保留', () => {
    const { budget, restart } = fixture()
    expect(budget.reserve('a', 700, 1000)).toBe(true)
    expect(budget.reserve('b', 400, 1000)).toBe(false)
    expect(budget.settle('a', 250)).toBe(250)
    expect(budget.settle('a', 250)).toBe(0)
    expect(restart().snapshot(1000).remaining).toBe(750)
  })
  it('跨中国时区午夜后按新一天计额度，旧请求结算到旧账期', () => {
    const { budget } = fixture()
    const before = Date.parse('2026-10-20T15:59:59Z'),
      after = before + 2000
    expect(budget.reserve('a', 100, 1000, before)).toBe(true)
    budget.settle('a', 50)
    expect(budget.snapshot(1000, 30, after)).toMatchObject({
      day: '2026-10-21',
      used: 0,
      reserved: 0,
    })
  })
  it('异常过期的预留保守入账，管理员可返还且不会变成负数', () => {
    const { budget } = fixture(),
      now = Date.now()
    budget.reserve('dead', 300, 1000, now - 3 * 60 * 60 * 1000)
    expect(budget.snapshot(1000, 30, now).used).toBe(300)
    budget.adjust(-1000)
    expect(budget.snapshot(1000).used).toBe(0)
  })
})
