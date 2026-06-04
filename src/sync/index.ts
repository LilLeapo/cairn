// 云同步层：本地优先不变——IndexedDB 仍是主存储，KV 只是一份加密镜像。
// 整张图序列化成一个快照，在浏览器里端到端加密后存到 /api/sync（Cloudflare KV）。
// 同步是「尽力而为」：网络/服务端出错绝不能弄崩应用，只记一条错误。

import * as db from '../db'
import type { GraphNode, CrossLink, Message } from '../types'
import { deriveStorageId, encryptJSON, decryptJSON, type EncryptedPayload } from './crypto'

const SYNC_URL = '/api/sync'

export interface Snapshot {
  version: 1
  updatedAt: number
  nodes: GraphNode[]
  links: CrossLink[]
  messages: Message[]
}

async function buildSnapshot(): Promise<Snapshot> {
  const [nodes, links, messages] = await Promise.all([
    db.getAllNodes(),
    db.getAllLinks(),
    db.getAllMessages(),
  ])
  return { version: 1, updatedAt: Date.now(), nodes, links, messages }
}

// 把云端快照写回本地（拉取后恢复）。
export async function applySnapshot(snap: Snapshot): Promise<void> {
  await db.importSnapshot({ nodes: snap.nodes, links: snap.links, messages: snap.messages })
}

// 立刻把整图加密上传。返回是否成功。
export async function pushNow(code: string): Promise<boolean> {
  const [id, snapshot] = await Promise.all([deriveStorageId(code), buildSnapshot()])
  const payload = await encryptJSON(code, snapshot)
  const resp = await fetch(`${SYNC_URL}?id=${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return resp.ok
}

// 从云端拉取并解密。无快照返回 null。
export async function pull(code: string): Promise<Snapshot | null> {
  const id = await deriveStorageId(code)
  const resp = await fetch(`${SYNC_URL}?id=${id}`)
  if (resp.status === 404) return null
  if (!resp.ok) throw new Error(`拉取失败：HTTP ${resp.status}`)
  const payload = (await resp.json()) as EncryptedPayload
  return decryptJSON<Snapshot>(code, payload)
}

// 防抖上传：写操作密集时停手几秒再整体推一次（省 KV 写额度、避免抖动）。
let timer: ReturnType<typeof setTimeout> | null = null
let inFlight = false
let again = false

export function schedulePush(
  code: string,
  onError?: (msg: string) => void,
  delayMs = 4000,
): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flush(code, onError), delayMs)
}

async function flush(code: string, onError?: (msg: string) => void): Promise<void> {
  if (inFlight) {
    again = true
    return
  }
  inFlight = true
  try {
    const ok = await pushNow(code)
    if (!ok) onError?.('云同步上传失败')
  } catch (e) {
    onError?.(e instanceof Error ? e.message : String(e))
  } finally {
    inFlight = false
    if (again) {
      again = false
      schedulePush(code, onError, 1000)
    }
  }
}
