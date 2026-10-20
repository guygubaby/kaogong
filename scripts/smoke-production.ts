import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const base = process.argv[2] ?? 'https://kaogong.guygubaby.top'
const admin = JSON.parse(readFileSync('.local/bootstrap.json', 'utf8')) as {
  email: string
  password: string
}
async function call(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie?: string,
) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = (await response.json()) as Record<string, unknown>
  return {
    response,
    json,
    cookie: response.headers
      .getSetCookie()
      .map((item) => item.split(';')[0])
      .join('; '),
  }
}
const health = await call('health')
assert.equal(health.json.service, 'kaogong')
const login = await call('auth/sign-in/email', 'POST', admin)
assert.equal(login.response.status, 200, JSON.stringify(login.json))
assert(login.cookie)
const me = await call('me', 'GET', undefined, login.cookie)
assert.equal((me.json.user as { role: string }).role, 'admin')
assert.equal((me.json.budget as { limit: number }).limit, 50_000_000)
const library = await call(
  'knowledge/documents?q=' + encodeURIComponent('申论'),
  'GET',
  undefined,
  login.cookie,
)
const documents = library.json.items as { id: string; title: string }[]
assert(documents.length > 0, JSON.stringify(library.json))
const document = await call(
  `knowledge/documents/${documents[0].id}`,
  'GET',
  undefined,
  login.cookie,
)
assert.equal(typeof document.json.body, 'string')
assert((document.json.body as string).length > 50)
const credential = {
  email: `verify-${crypto.randomUUID()}@example.com`,
  password: crypto.randomUUID() + 'Aa1!',
  name: '功能验证账号',
  role: 'admin',
}
let learnerId: string | undefined
try {
  const escalation = await call('auth/sign-up/email', 'POST', credential)
  assert.equal(
    escalation.response.status,
    400,
    '注册接口不应允许传入管理员角色',
  )
  const { role: _role, ...registration } = credential
  const signup = await call('auth/sign-up/email', 'POST', registration)
  assert.equal(signup.response.status, 200, JSON.stringify(signup.json))
  assert(signup.cookie)
  learnerId = (signup.json.user as { id: string }).id
  const denied = await call('admin/monitor', 'GET', undefined, signup.cookie)
  assert.equal(denied.response.status, 403)
  const learner = await call('me', 'GET', undefined, signup.cookie)
  assert.equal((learner.json.user as { role: string }).role, 'user')
  const edit = await call(
    `admin/users/${learnerId}`,
    'PATCH',
    {
      dailyTokenLimit: 1000,
      requestsPerMinute: 30,
      banned: false,
      usageDelta: 0,
    },
    login.cookie,
  )
  assert.equal(edit.response.status, 200, JSON.stringify(edit.json))
  const updated = await call('me', 'GET', undefined, signup.cookie)
  assert.equal((updated.json.budget as { limit: number }).limit, 1000)
  let limited = false
  for (let index = 0; index < 31; index++) {
    const result = await call('models', 'GET', undefined, signup.cookie)
    if (result.response.status === 429) {
      limited = true
      break
    }
    assert.equal(result.response.status, 200, JSON.stringify(result.json))
  }
  assert(limited, '每分钟限制没有生效')
  const crossOrigin = await fetch(`${base}/api/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://other.invalid',
      Cookie: login.cookie,
    },
    body: JSON.stringify({ title: '不应被创建' }),
  })
  assert.equal(crossOrigin.status, 403)
  const monitor = await call('admin/monitor', 'GET', undefined, login.cookie)
  assert.equal(monitor.response.status, 200)
  console.log(
    JSON.stringify({
      health: 'passed',
      adminLogin: 'passed',
      chineseSearch: 'passed',
      sourceReading: 'passed',
      registration: 'passed',
      roleIsolation: 'passed',
      administratorQuotaEdit: 'passed',
      perMinuteLimit: 'passed',
      crossOriginProtection: 'passed',
      monitor: 'passed',
    }),
  )
} finally {
  if (learnerId) {
    const removed = await call(
      'auth/admin/remove-user',
      'POST',
      { userId: learnerId },
      login.cookie,
    )
    assert.equal(removed.response.status, 200, '测试账号清理失败')
    console.log('临时验证账号已清理。')
  }
}
