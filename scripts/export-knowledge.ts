import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeSync,
} from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { excludedKnowledgePaths } from '../src/lib/knowledge-scope'
import { rewriteKnowledgeLinks } from './knowledge-links'

const source = resolve(
  process.env.KNOWLEDGE_SOURCE ?? 'src-all-base-knownleage',
)
const skill =
  process.env.KAOGONG_SKILL ??
  `${process.env.HOME}/.codex/skills/bryce-kaogong-doc`
const out = resolve('.data')
mkdirSync(out, { recursive: true })
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex').slice(0, 24)
const sqlString = (value: string) =>
  `'${value.replaceAll('\0', '').replaceAll("'", "''")}'`
function files(root: string, extension?: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name.startsWith('.')) return []
      const file = join(root, entry.name)
      return entry.isDirectory()
        ? files(file, extension)
        : !extension || file.endsWith(extension)
          ? [file]
          : []
    })
    .sort()
}
const lectures = join(source, 'saduck/kaogong')
const vault = join(source, 'kaogongzhentizhengliu')
if (!existsSync(join(lectures, 'md2')) || !existsSync(join(vault, '10-真题')))
  throw new Error('本地资料目录不可用，请设置 KNOWLEDGE_SOURCE')
const documents = [
  ...files(join(lectures, 'md2'), '.md').map((file) => ({
    file,
    path: `lectures/${relative(join(lectures, 'md2'), file)}`,
    kind: 'lecture',
  })),
  ...['10-真题', '15-材料', '20-考点', '30-疑点复核'].flatMap((folder) =>
    files(join(vault, folder), '.md').map((file) => ({
      file,
      path: `questions/${relative(vault, file)}`,
      kind:
        folder === '10-真题'
          ? 'question'
          : folder === '15-材料'
            ? 'material'
            : folder === '20-考点'
              ? 'topic'
              : 'issues',
    })),
  ),
  ...[
    join(skill, 'SKILL.md'),
    ...files(join(skill, 'references'), '.md').filter(
      (file) =>
        !file.includes('/source/') &&
        !file.includes('/pages/') &&
        !file.includes('/zhenti/'),
    ),
  ].map((file) => ({
    file,
    path: `skill/${relative(skill, file)}`,
    kind:
      file.includes('/references/linxuan/') && !file.endsWith('/INDEX.md')
        ? 'topic'
        : 'skill',
  })),
].filter((item) => !excludedKnowledgePaths.has(item.path))
const pathIds = new Map(documents.map((item) => [item.path, hash(item.path)]))
const sql = openSync(join(out, 'knowledge.sql'), 'w')
const pack = openSync(join(out, 'content.pack'), 'w')
let offset = 0
const assets = new Map<string, string>()
writeSync(
  sql,
  'DELETE FROM knowledge_fts;\nDELETE FROM KnowledgeDocument;\nDELETE FROM KnowledgeAsset;\n',
)
function asset(file: string, key: string) {
  const id = hash(key)
  if (assets.has(id) || !existsSync(file))
    return assets.has(id) ? `/api/knowledge/assets/${id}` : ''
  const body = readFileSync(file)
  const type =
    (
      {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.js': 'text/javascript',
        '.html': 'text/html',
        '.md': 'text/markdown',
      } as Record<string, string>
    )[extname(file)] ?? 'application/octet-stream'
  writeSync(pack, body)
  writeSync(
    sql,
    `INSERT INTO KnowledgeAsset(id,offset,length,contentType) VALUES (${sqlString(id)},${offset},${body.length},${sqlString(type)});\n`,
  )
  offset += body.length
  assets.set(id, key)
  return `/api/knowledge/assets/${id}`
}
function image(file: string, target: string, lecture: boolean) {
  const decoded = decodeURIComponent(target)
  const absolute = lecture
    ? join(lectures, 'img', decoded.split('/').at(-1)!)
    : resolve(dirname(file), decoded)
  const allowed = lecture ? join(lectures, 'img') : join(vault, '90-图片')
  if (!absolute.startsWith(`${allowed}/`)) return ''
  return asset(
    absolute,
    lecture
      ? `lecture/${relative(allowed, absolute)}`
      : `vault/${relative(vault, absolute)}`,
  )
}
const doubts = readFileSync(join(vault, '30-疑点复核/疑点清单.md'), 'utf8')
const missing = readFileSync(join(skill, 'references/PATH-CHECK.md'), 'utf8')
for (const item of documents) {
  const lecture = item.kind === 'lecture'
  let body = readFileSync(item.file, 'utf8')
  const title =
    body.match(/^# (.+)$/m)?.[1].trim() ??
    item.path.split('/').at(-1)!.replace(/\.md$/, '')
  const module = item.path.startsWith('skill/references/linxuan/')
    ? '遴选'
    : lecture
      ? ((
          {
            'monthly-affairs': '每月时政',
            share: '国情省情',
            综应: '综合应用能力',
            专业: '公安专业',
            言语理解: '言语理解与表达',
          } as Record<string, string>
        )[item.path.slice(9).split('__')[0]] ??
        item.path.slice(9).split('__')[0])
      : (item.path.split('/')[2] ?? '知识库索引')
  body = body
    .replace(
      /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
      (_match, target: string) => {
        const url = image(item.file, target, lecture)
        return url
          ? ` ![${target.includes('formula-') ? '公式' : '题目配图'}](${url}) `
          : ' [原库缺少此图片] '
      },
    )
    .replace(
      /!\[([^\]]*)\]\(([^\s)]+)\)/g,
      (match, alt: string, target: string) => {
        if (target.startsWith('/api/')) return match
        const url = image(item.file, target, lecture)
        return url ? `![${alt || '讲义配图'}](${url})` : '[原库缺少此图片]'
      },
    )
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_match, target: string, label?: string) => {
        const path = `questions/${target.split('#')[0]}${target.endsWith('.md') ? '' : '.md'}`
        const id = pathIds.get(path)
        return id
          ? `[${label ?? target}](/learn/library?doc=${id})`
          : (label ?? target)
      },
    )
    .replace(/<\/?p[^>]*>/g, '\n\n')
    .replace(/<br\s*\/?\s*>/g, '\n')
    .replace(/<\/?u>/g, '')
  body = rewriteKnowledgeLinks(body, item.path, pathIds)
  const qid = item.path.match(/\/(\d+) /)?.[1]
  const issue = Boolean(
    qid &&
    (new RegExp(`\\b${qid}\\b`).test(doubts) ||
      new RegExp(`\\b${qid}\\b`).test(missing)),
  )
  const split = Buffer.byteLength(body) > 60_000
  writeSync(
    sql,
    `INSERT INTO KnowledgeDocument(id,kind,module,title,path,body,issue) VALUES (${[hash(item.path), item.kind, module, title, item.path, split ? '' : body].map(sqlString).join(',')},${issue ? 1 : 0});\n`,
  )
  if (split)
    for (let start = 0; start < body.length; start += 6000)
      writeSync(
        sql,
        `UPDATE KnowledgeDocument SET body=body||${sqlString(body.slice(start, start + 6000))} WHERE id=${sqlString(hash(item.path))};\n`,
      )
  if (lecture) {
    const slug = relative(join(lectures, 'md2'), item.file).slice(0, -3)
    for (const [folder, ext] of [
      ['md', 'md'],
      ['chunks', 'js'],
      ['raw', 'html'],
    ])
      asset(
        join(lectures, folder, `${slug}.${ext}`),
        `fallback/${folder}/${slug}.${ext}`,
      )
  }
}
writeSync(sql, "INSERT INTO knowledge_fts(knowledge_fts) VALUES ('rebuild');\n")
closeSync(sql)
closeSync(pack)
const summary = {
  documents: documents.length,
  assets: assets.size,
  packBytes: offset,
  sqlBytes: statSync(join(out, 'knowledge.sql')).size,
}
console.log(JSON.stringify(summary))
