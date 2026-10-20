import { afterEach, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  conversationMessage,
  deleteConversation,
} from '../src/lib/server/conversations'

const databases: DatabaseSync[] = []
function fixture() {
  const sql = new DatabaseSync(':memory:')
  databases.push(sql)
  sql.exec(`CREATE TABLE Conversation (id TEXT PRIMARY KEY, userId TEXT);
    CREATE TABLE Message (id TEXT PRIMARY KEY, conversationId TEXT, userId TEXT, role TEXT, content TEXT, sources TEXT, createdAt TEXT);
    CREATE TABLE UsageEvent (id TEXT PRIMARY KEY, conversationId TEXT, totalTokens INTEGER);
    INSERT INTO Conversation VALUES ('chat','owner');
    INSERT INTO UsageEvent VALUES ('usage','chat',1234);`)
  const db = {
    prepare(query: string) {
      return {
        bind(...params: string[]) {
          return {
            run: async () => ({
              meta: {
                changes: Number(sql.prepare(query).run(...params).changes),
              },
            }),
          }
        },
      }
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sql.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        sql.exec('COMMIT')
        return results
      } catch (error) {
        sql.exec('ROLLBACK')
        throw error
      }
    },
  } as unknown as D1Database
  return { db, sql }
}
afterEach(() => databases.splice(0).forEach((db) => db.close()))

it('会话所有者删除消息与会话，保留用量，并拒绝删除后的迟到回答', async () => {
  const { db, sql } = fixture()
  const input = {
    conversationId: 'chat',
    userId: 'owner',
    role: 'user' as const,
    content: '学习申论',
    createdAt: new Date().toISOString(),
  }
  expect((await conversationMessage(db, input).run()).meta.changes).toBe(1)
  await deleteConversation(db, 'chat', 'owner')
  expect(
    sql.prepare('SELECT COUNT(*) AS count FROM Message').get()?.count,
  ).toBe(0)
  expect(
    sql.prepare('SELECT COUNT(*) AS count FROM Conversation').get()?.count,
  ).toBe(0)
  expect(
    sql.prepare('SELECT totalTokens FROM UsageEvent').get()?.totalTokens,
  ).toBe(1234)
  expect(
    (
      await conversationMessage(db, {
        ...input,
        role: 'assistant',
        content: '迟到的流式回答',
      }).run()
    ).meta.changes,
  ).toBe(0)
})

it('不能向他人会话写入消息，也不能删除他人会话或消息', async () => {
  const { db, sql } = fixture()
  const message = {
    conversationId: 'chat',
    userId: 'owner',
    role: 'user' as const,
    content: '保留的消息',
    createdAt: new Date().toISOString(),
  }
  await conversationMessage(db, message).run()
  expect(
    (await conversationMessage(db, { ...message, userId: 'other' }).run()).meta
      .changes,
  ).toBe(0)
  await expect(deleteConversation(db, 'chat', 'other')).rejects.toMatchObject({
    status: 404,
  })
  expect(sql.prepare('SELECT content FROM Message').get()?.content).toBe(
    '保留的消息',
  )
  expect(
    sql.prepare('SELECT COUNT(*) AS count FROM Conversation').get()?.count,
  ).toBe(1)
})
