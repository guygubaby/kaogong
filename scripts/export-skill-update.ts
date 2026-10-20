import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { excludedKnowledgePaths } from '../src/lib/knowledge-scope'
import { learningContent } from '../src/lib/learning-content'
import { rewriteKnowledgeLinks } from './knowledge-links'

const skill = resolve(
  process.env.KAOGONG_SKILL ??
    join(homedir(), '.codex/skills/bryce-kaogong-doc'),
)
const hash = (path: string) =>
  createHash('sha256').update(path).digest('hex').slice(0, 24)
const quote = (value: string) =>
  `'${value.replaceAll('\0', '').replaceAll("'", "''")}'`
function references(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name.startsWith('.') ||
      ['source', 'pages', 'zhenti'].includes(entry.name)
    )
      return []
    const path = join(root, entry.name)
    return entry.isDirectory()
      ? references(path)
      : path.endsWith('.md')
        ? [path]
        : []
  })
}
const updates = [
  'SKILL.md',
  'references/INDEX.md',
  'references/SEARCH.md',
  ...readdirSync(join(skill, 'references/linxuan'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `references/linxuan/${name}`),
]
  .map((path) => ({ file: join(skill, path), path: `skill/${path}` }))
  .filter((item) => !excludedKnowledgePaths.has(item.path))
const ids = new Map(
  [join(skill, 'SKILL.md'), ...references(join(skill, 'references'))].map(
    (file) => {
      const path = `skill/${relative(skill, file)}`
      return [path, hash(path)] as const
    },
  ),
)
const sql: string[] = []
const hidden = [...excludedKnowledgePaths].map(quote).join(',')
sql.push(
  `INSERT INTO knowledge_fts(knowledge_fts,rowid,title,body) SELECT 'delete',rowid,title,body FROM KnowledgeDocument WHERE path IN (${hidden});`,
)
sql.push(`DELETE FROM KnowledgeDocument WHERE path IN (${hidden});`)
for (const item of updates) {
  if (!existsSync(item.file)) throw new Error(`缺少 Skill 文件：${item.file}`)
  const body = rewriteKnowledgeLinks(
    learningContent(readFileSync(item.file, 'utf8')),
    item.path,
    ids,
  )
  if (Buffer.byteLength(body) > 50_000)
    throw new Error(`此文件过大，请拆分为专题参考后更新：${item.path}`)
  const title =
    body.match(/^# (.+)$/m)?.[1]?.trim() ?? basename(item.path, '.md')
  const linxuan = item.path.startsWith('skill/references/linxuan/')
  const kind = linxuan && basename(item.path) !== 'INDEX.md' ? 'topic' : 'skill'
  const module = linxuan ? '遴选' : (item.path.split('/')[2] ?? '知识库索引')
  const id = quote(hash(item.path))
  sql.push(
    `INSERT INTO knowledge_fts(knowledge_fts,rowid,title,body) SELECT 'delete',rowid,title,body FROM KnowledgeDocument WHERE id=${id};`,
  )
  sql.push(
    `INSERT INTO KnowledgeDocument(id,kind,module,title,path,body,issue) VALUES (${[hash(item.path), kind, module, title, item.path, body].map(quote).join(',')},0) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,module=excluded.module,title=excluded.title,path=excluded.path,body=excluded.body,issue=excluded.issue;`,
  )
  sql.push(
    `INSERT INTO knowledge_fts(rowid,title,body) SELECT rowid,title,body FROM KnowledgeDocument WHERE id=${id};`,
  )
}
mkdirSync('.data', { recursive: true })
writeFileSync('.data/skill-update.sql', sql.join('\n') + '\n')
console.log(
  `已导出 ${updates.length} 份 Skill 更新至 .data/skill-update.sql；资源包、用户和对话不在更新范围内。`,
)
