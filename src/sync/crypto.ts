// 端到端加密：守住「从不上传明文」这条铁律。
// 同步码留在浏览器，派生出两样东西——服务端两样都拿不到原文：
//   存储 ID  = SHA-256(同步码)        → 当 KV 的 key（单向，服务端无法反推同步码）
//   加密密钥 = PBKDF2(同步码, salt)    → AES-GCM 加解密整图
// 服务端 KV 里只有 { salt, iv, ct }，没有同步码就解不开。

const enc = new TextEncoder()
const dec = new TextDecoder()

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// TS 5.7 起 TypedArray 对缓冲区类型收紧，WebCrypto 要的是 ArrayBuffer 支持的 BufferSource。
// 拷成独立 ArrayBuffer 既满足类型，运行时也正确。
function ab(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

// 生成一串高熵同步码（换设备时输入它即可拉回整张图）。
export function generateSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15))
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789' // 去掉易混的 l/o/0/1
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return `cairn-${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10, 15)}`
}

// 存储 ID：SHA-256(同步码) 的 hex。当 KV key，服务端见到也反推不出同步码。
export async function deriveStorageId(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', ab(enc.encode(code.trim())))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function deriveKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', ab(enc.encode(code.trim())), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: ab(salt), iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export interface EncryptedPayload {
  v: 1
  salt: string // base64
  iv: string // base64
  ct: string // base64
}

export async function encryptJSON(code: string, data: unknown): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(code, salt)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ab(iv) },
    key,
    ab(enc.encode(JSON.stringify(data))),
  )
  return { v: 1, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) }
}

export async function decryptJSON<T>(code: string, payload: EncryptedPayload): Promise<T> {
  const salt = fromB64(payload.salt)
  const iv = fromB64(payload.iv)
  const key = await deriveKey(code, salt)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ab(iv) }, key, ab(fromB64(payload.ct)))
  return JSON.parse(dec.decode(plain)) as T
}
