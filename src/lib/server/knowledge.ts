import { createHash } from 'node:crypto'
import type { KnowledgeItem } from '../shared'
import { learningContent } from '../learning-content'
import { runtime } from './runtime'
import { HttpError } from './http'

export const contentId = (path: string) =>
  createHash('sha256').update(path).digest('hex').slice(0, 24)
type DocumentRow = Omit<KnowledgeItem, 'issue'> & {
  body: string
  path: string
  issue: number
}
function summaryOf(row: Omit<DocumentRow, 'body'>): KnowledgeItem {
  return {
    id: row.id,
    title: learningContent(row.title),
    module: row.module,
    kind: row.kind,
    issue: Boolean(row.issue),
  }
}
export async function searchKnowledge(
  query: string,
  module?: string,
  limit = 8,
) {
  const { env } = runtime()
  const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 8)
  if (!terms.length) return []
  const moduleClause = module ? ' AND d.module = ?' : ''
  const searchable = terms.filter((term) => [...term].length >= 3)
  let rows: DocumentRow[] = []
  if (searchable.length) {
    const match = searchable
      .map((term) => `"${term.replaceAll('"', '""')}"`)
      .join(' OR ')
    const result = await env.DB.prepare(
      `SELECT d.id, d.kind, d.module, d.title, d.path, d.issue, substr(d.body, 1, 500) AS body FROM knowledge_fts f JOIN KnowledgeDocument d ON d.rowid=f.rowid WHERE knowledge_fts MATCH ?${moduleClause} ORDER BY bm25(knowledge_fts) LIMIT ?`,
    )
      .bind(match, ...(module ? [module] : []), limit)
      .all<DocumentRow>()
    rows = result.results
  }
  if (!rows.length) {
    const pattern = `%${terms[0].replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
    const result = await env.DB.prepare(
      `SELECT d.id, d.kind, d.module, d.title, d.path, d.issue, substr(d.body, 1, 500) AS body FROM KnowledgeDocument d WHERE (d.title LIKE ? ESCAPE '\\' OR d.body LIKE ? ESCAPE '\\')${moduleClause} ORDER BY CASE WHEN d.kind='lecture' THEN 0 ELSE 1 END, d.title LIMIT ?`,
    )
      .bind(pattern, pattern, ...(module ? [module] : []), limit)
      .all<DocumentRow>()
    rows = result.results
  }
  return rows.map((row) => ({
    ...summaryOf(row),
    excerpt: learningContent(row.body),
  }))
}
export async function readDocument(id: string, offset = 0, length = 12_000) {
  const row = await runtime()
    .env.DB.prepare('SELECT * FROM KnowledgeDocument WHERE id = ?')
    .bind(id)
    .first<DocumentRow>()
  if (!row) throw new HttpError(404, 'DOCUMENT_NOT_FOUND', '这份资料尚未收录')
  const body = learningContent(row.body)
  return {
    ...summaryOf(row),
    body: body.slice(offset, offset + length),
    offset,
    totalLength: body.length,
  }
}
export async function knownIssues(qid: string) {
  if (!/^\d{1,12}$/.test(qid))
    throw new HttpError(400, 'INVALID_QID', '题号格式不正确')
  const paths = [
    'questions/30-疑点复核/疑点清单.md',
    'skill/references/PATH-CHECK.md',
  ]
  const result = await runtime()
    .env.DB.prepare(
      'SELECT path, body FROM KnowledgeDocument WHERE path IN (?, ?)',
    )
    .bind(...paths)
    .all<{ path: string; body: string }>()
  return result.results.flatMap((row) =>
    row.body
      .split('\n')
      .filter((line) => new RegExp(`\\b${qid}\\b`).test(line))
      .map((text) => ({ text: learningContent(text) })),
  )
}
export async function originalArtifact(
  documentId: string,
  format: 'md' | 'js' | 'html',
  keyword: string,
) {
  const document = await runtime()
    .env.DB.prepare('SELECT path FROM KnowledgeDocument WHERE id = ?')
    .bind(documentId)
    .first<{ path: string }>()
  if (!document?.path.startsWith('lectures/'))
    throw new HttpError(400, 'NOT_LECTURE', '备用源码仅适用于讲义')
  const slug = document.path.slice('lectures/'.length, -3)
  const folder = format === 'js' ? 'chunks' : format === 'html' ? 'raw' : 'md'
  const assetId = contentId(`fallback/${folder}/${slug}.${format}`)
  const row = await runtime()
    .env.DB.prepare('SELECT * FROM KnowledgeAsset WHERE id = ?')
    .bind(assetId)
    .first<{ offset: number; length: number }>()
  if (!row) return { found: false, message: '此页没有对应的本地备用资料' }
  const object = await runtime().env.KNOWLEDGE.get('content.pack', {
    range: { offset: row.offset, length: row.length },
  })
  if (!object)
    throw new HttpError(503, 'KNOWLEDGE_UNAVAILABLE', '知识库资源尚未同步')
  const body = await object.text()
  const index = keyword ? body.indexOf(keyword) : 0
  return {
    found: index >= 0,
    format,
    excerpt: learningContent(
      body.slice(Math.max(0, index - 1200), Math.max(0, index - 1200) + 12_000),
    ),
  }
}
