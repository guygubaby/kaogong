import { HttpError } from './http'

export function conversationMessage(
  db: D1Database,
  message: {
    conversationId: string
    userId: string
    role: 'user' | 'assistant'
    content: string
    createdAt: string
  },
) {
  // 流式回答结束前，会话可能已在另一个标签页中删除。
  return db
    .prepare(
      "INSERT INTO Message (id,conversationId,userId,role,content,sources,createdAt) SELECT ?,?,?,?,?, '[]', ? WHERE EXISTS (SELECT 1 FROM Conversation WHERE id=? AND userId=?)",
    )
    .bind(
      crypto.randomUUID(),
      message.conversationId,
      message.userId,
      message.role,
      message.content,
      message.createdAt,
      message.conversationId,
      message.userId,
    )
}

export async function deleteConversation(
  db: D1Database,
  id: string,
  userId: string,
) {
  const results = await db.batch([
    db
      .prepare(
        'DELETE FROM Message WHERE conversationId=? AND userId=? AND EXISTS (SELECT 1 FROM Conversation WHERE id=? AND userId=?)',
      )
      .bind(id, userId, id, userId),
    db
      .prepare('DELETE FROM Conversation WHERE id=? AND userId=?')
      .bind(id, userId),
  ])
  if (!results[1].meta.changes)
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', '这段会话不存在或已删除')
}
