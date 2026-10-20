import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { rewriteKnowledgeLinks } from '../scripts/knowledge-links'

it('将相对课程链接改为在线阅读地址，保留图片和外链，移除排除页面的入口', () => {
  const ids = new Map([
    ['skill/references/linxuan/GUIDE.md', 'guide'],
    ['lectures/申论__阅读.md', 'lecture'],
  ])
  const result = rewriteKnowledgeLinks(
    '[学习](GUIDE.md) [正文](<../pages/申论__阅读.md>) ![公式](GUIDE.md) [官网](https://example.com/a) [记录](SOURCES.md)',
    'skill/references/linxuan/INDEX.md',
    ids,
  )
  expect(result).toContain('[学习](/learn/library?doc=guide)')
  expect(result).toContain('[正文](/learn/library?doc=lecture)')
  expect(result).toContain('![公式](GUIDE.md)')
  expect(result).toContain('[官网](https://example.com/a)')
  expect(result).not.toContain('(SOURCES.md)')
})

it('增量更新可重复执行，重建对应全文索引并保留题库、图片偏移和用户数据', () => {
  const root = mkdtempSync(join(tmpdir(), 'kaogong-skill-'))
  const skill = join(root, 'skill')
  const source = {
    'SKILL.md': '# 技能入口\n[遴选](references/linxuan/INDEX.md)',
    'references/INDEX.md': '# 全库入口\n[遴选](linxuan/INDEX.md)',
    'references/SEARCH.md': '# 检索方法\n案例分析',
    'references/linxuan/INDEX.md': '# 遴选索引\n[学习](GUIDE.md)',
    'references/linxuan/GUIDE.md': '# 遴选案例分析\n工作实务训练',
    'references/linxuan/SOURCES.md':
      '# 内部核验\nhttps://internal-reference.invalid/',
  }
  const db = new DatabaseSync(':memory:')
  try {
    for (const [path, body] of Object.entries(source)) {
      const full = join(skill, path)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, body)
    }
    execFileSync(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        resolve('scripts/export-skill-update.ts'),
      ],
      {
        cwd: root,
        env: { ...process.env, KAOGONG_SKILL: skill },
        stdio: 'pipe',
      },
    )
    const sql = readFileSync(join(root, '.data/skill-update.sql'), 'utf8')
    expect(sql).not.toContain('https://internal-reference.invalid/')
    db.exec(`CREATE TABLE KnowledgeDocument(id TEXT PRIMARY KEY,kind TEXT,module TEXT,title TEXT,path TEXT UNIQUE,body TEXT,issue INTEGER);
      CREATE VIRTUAL TABLE knowledge_fts USING fts5(title,body,content='KnowledgeDocument',content_rowid='rowid',tokenize='trigram');
      CREATE TABLE KnowledgeAsset(id TEXT,offset INTEGER); INSERT INTO KnowledgeAsset VALUES ('image',42);
      CREATE TABLE User(id TEXT,name TEXT); INSERT INTO User VALUES ('user','学习者');
      INSERT INTO KnowledgeDocument VALUES ('keep','question','资料分析','保留题目','questions/keep.md','原题正文',0);
      INSERT INTO KnowledgeDocument VALUES ('hidden','lecture','PrivacyPolicy.md','隐私政策','lectures/PrivacyPolicy.md','移除的文本',0);
      INSERT INTO knowledge_fts(knowledge_fts) VALUES ('rebuild');`)
    db.exec(sql)
    const count = db
      .prepare('SELECT COUNT(*) AS count FROM KnowledgeDocument')
      .get()?.count
    db.exec(sql)
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM KnowledgeDocument').get()
        ?.count,
    ).toBe(count)
    expect(
      db.prepare("SELECT body FROM KnowledgeDocument WHERE id='keep'").get()
        ?.body,
    ).toBe('原题正文')
    expect(
      db.prepare("SELECT id FROM KnowledgeDocument WHERE id='hidden'").get(),
    ).toBeUndefined()
    expect(db.prepare('SELECT offset FROM KnowledgeAsset').get()?.offset).toBe(
      42,
    )
    expect(db.prepare('SELECT name FROM User').get()?.name).toBe('学习者')
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM KnowledgeDocument WHERE kind='topic' AND module='遴选'",
        )
        .get()?.count,
    ).toBe(1)
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM knowledge_fts WHERE knowledge_fts MATCH '工作实务'",
        )
        .get()?.count,
    ).toBe(1)
  } finally {
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})
