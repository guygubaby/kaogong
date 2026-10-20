import { timingSafeEqual } from 'node:crypto'
import { runtime } from './runtime'

async function key() {
  const bytes = Uint8Array.from(atob(runtime().env.ENCRYPTION_KEY), (c) =>
    c.charCodeAt(0),
  )
  if (bytes.length !== 32) throw new Error('ENCRYPTION_KEY 必须是 32 字节')
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}
export async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const body = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await key(),
      new TextEncoder().encode(value),
    ),
  )
  return btoa(String.fromCharCode(...iv, ...body))
}
export async function decrypt(value: string) {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      await key(),
      bytes.slice(12),
    ),
  )
}
export async function sameSecret(value: string, expected: string) {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(value)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
