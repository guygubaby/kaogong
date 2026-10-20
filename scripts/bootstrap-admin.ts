import { readFileSync } from 'node:fs'
const url = process.argv[2] ?? 'http://localhost:3007'
const config = JSON.parse(readFileSync('.local/bootstrap.json', 'utf8')) as {
  email: string
  password: string
  name: string
  BOOTSTRAP_TOKEN: string
}
const health = (await fetch(`${url}/api/health`).then((response) =>
  response.json(),
)) as { service?: string }
if (health.service !== 'kaogong')
  throw new Error('目标不是当前考公服务，已停止初始化')
const response = await fetch(`${url}/api/setup`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${config.BOOTSTRAP_TOKEN}`,
    'Content-Type': 'application/json',
    Origin: url,
  },
  body: JSON.stringify({
    email: config.email,
    password: config.password,
    name: config.name,
  }),
})
if (!response.ok) {
  const result = (await response.json()) as { error?: { message: string } }
  throw new Error(result.error?.message ?? '管理员初始化失败')
}
console.log(
  `管理员已初始化：${config.email}。密码保存在 .local/bootstrap.json，未打印或写入仓库。`,
)
