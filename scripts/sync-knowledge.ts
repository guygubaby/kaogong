import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const account =
  process.env.CLOUDFLARE_ACCOUNT_ID ?? 'dffac4f6d50c0e96731800e04a9c50fb'
const database =
  process.env.CLOUDFLARE_DATABASE_ID ?? '76c6092c-748a-40e8-aeb6-ed05c680b16b'
// cf 暂未提供批量导入命令；按官方 D1 import 协议上传，不输出临时签名 URL 或令牌。
const profile =
  process.platform === 'darwin'
    ? join(homedir(), 'Library/Preferences/cloudflare/config/default.json')
    : join(homedir(), '.config/cloudflare/config/default.json')
const token: string =
  process.env.CLOUDFLARE_API_TOKEN ||
  JSON.parse(readFileSync(profile, 'utf8')).oauth_token
if (!token)
  throw new Error('请先运行 cf auth login，或设置 CLOUDFLARE_API_TOKEN')
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/import`
// shortcut: 资源包整体覆盖，更新知识库需维护窗口；多版本并行时改为版本化包键。
const sql = readFileSync('.data/knowledge.sql')
const etag = createHash('md5').update(sql).digest('hex')
type ImportResult = {
  upload_url?: string
  filename?: string
  at_bookmark?: string
  success?: boolean
  error?: string
  status?: string
  messages?: string[]
}
async function action(body: Record<string, string>) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const result = (await response.json()) as {
    success: boolean
    result: ImportResult
    errors?: { message: string }[]
  }
  if (!response.ok || !result.success)
    throw new Error(
      `D1 导入请求失败：${result.errors?.map((error) => error.message).join('; ') ?? response.status}`,
    )
  return result.result
}
const init = await action({ action: 'init', etag })
if (init.upload_url) {
  console.log('正在上传知识库 SQL…')
  const upload = await fetch(init.upload_url, {
    method: 'PUT',
    body: sql,
    redirect: 'manual',
  })
  if (!upload.ok || upload.headers.get('etag')?.replaceAll('"', '') !== etag)
    throw new Error('SQL 上传失败或完整性校验未通过')
}
if (!init.filename) throw new Error('D1 未返回导入文件标识')
let state = await action({ action: 'ingest', etag, filename: init.filename })
for (let attempt = 0; attempt < 600; attempt++) {
  if (state.success || state.status === 'complete') {
    console.log('知识库导入成功')
    process.exit(0)
  }
  if (state.error) throw new Error(`知识库导入失败：${state.error}`)
  if (attempt % 10 === 0)
    console.log(`知识库正在导入（${state.status ?? '处理中'}）…`)
  await new Promise((resolve) => setTimeout(resolve, 2000))
  state = await action({
    action: 'poll',
    current_bookmark: state.at_bookmark ?? '',
  })
}
throw new Error('导入等待超时，请在 D1 控制台核对状态后再操作')
