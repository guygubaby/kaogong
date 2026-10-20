import { DurableObject } from 'cloudflare:workers'
import { chinaDay } from './http'

export class UserBudget extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS budgets (day TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0, reserved INTEGER NOT NULL DEFAULT 0)',
    )
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, day TEXT NOT NULL, amount INTEGER NOT NULL, expires INTEGER NOT NULL)',
    )
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS requests (time INTEGER NOT NULL)',
    )
  }
  rate(limit: number, now = Date.now()) {
    const sql = this.ctx.storage.sql
    sql.exec('DELETE FROM requests WHERE time <= ?', now - 60_000)
    const count = sql
      .exec<{ count: number }>('SELECT COUNT(*) AS count FROM requests')
      .one().count
    if (count >= limit) return false
    sql.exec('INSERT INTO requests(time) VALUES (?)', now)
    return true
  }
  snapshot(limit: number, requestsPerMinute = 30, now = Date.now()) {
    this.expire(now)
    const day = chinaDay(now)
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO budgets(day) VALUES (?)',
      day,
    )
    const row = this.ctx.storage.sql
      .exec<{ used: number; reserved: number }>(
        'SELECT used, reserved FROM budgets WHERE day = ?',
        day,
      )
      .one()
    return {
      day,
      ...row,
      limit,
      remaining: Math.max(0, limit - row.used - row.reserved),
      requestsPerMinute,
    }
  }
  reserve(id: string, amount: number, limit: number, now = Date.now()) {
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw new Error('无效的预留额度')
    const state = this.snapshot(limit, 30, now)
    if (
      this.ctx.storage.sql
        .exec('SELECT id FROM leases WHERE id = ?', id)
        .toArray().length
    )
      return true
    if (amount > state.remaining) return false
    this.ctx.storage.sql.exec(
      'INSERT INTO leases(id, day, amount, expires) VALUES (?, ?, ?, ?)',
      id,
      state.day,
      amount,
      now + 2 * 60 * 60 * 1000,
    )
    this.ctx.storage.sql.exec(
      'UPDATE budgets SET reserved = reserved + ? WHERE day = ?',
      amount,
      state.day,
    )
    return true
  }
  settle(id: string, actual: number | null) {
    const sql = this.ctx.storage.sql
    const row = sql
      .exec<{ day: string; amount: number }>(
        'SELECT day, amount FROM leases WHERE id = ?',
        id,
      )
      .toArray()[0]
    if (!row) return 0
    const charge = actual === null ? row.amount : Math.max(0, Math.ceil(actual))
    sql.exec(
      'UPDATE budgets SET reserved = reserved - ?, used = used + ? WHERE day = ?',
      row.amount,
      charge,
      row.day,
    )
    sql.exec('DELETE FROM leases WHERE id = ?', id)
    return charge
  }
  adjust(delta: number) {
    if (!Number.isSafeInteger(delta)) throw new Error('无效的额度调整')
    const day = chinaDay()
    this.snapshot(Number.MAX_SAFE_INTEGER)
    this.ctx.storage.sql.exec(
      'UPDATE budgets SET used = MAX(0, used + ?) WHERE day = ?',
      delta,
      day,
    )
  }
  private expire(now: number) {
    for (const lease of this.ctx.storage.sql
      .exec<{ id: string }>('SELECT id FROM leases WHERE expires <= ?', now)
      .toArray())
      this.settle(lease.id, null)
  }
}
