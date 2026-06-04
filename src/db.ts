import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { GraphNode, CrossLink, Message, Settings } from './types'

// 本地优先：那张图是你理解的底片，永远不离开你的机器。
// 全部存在 IndexedDB —— 没有一行非得在服务器上。

interface CairnDB extends DBSchema {
  nodes: {
    key: string
    value: GraphNode
    indexes: { byParent: string }
  }
  links: {
    key: string
    value: CrossLink
  }
  messages: {
    key: string
    value: Message
    indexes: { byNode: string }
  }
  settings: {
    key: string
    value: unknown
  }
}

const DB_NAME = 'cairn'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<CairnDB>> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB<CairnDB>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        const nodes = d.createObjectStore('nodes', { keyPath: 'id' })
        nodes.createIndex('byParent', 'parentId')

        d.createObjectStore('links', { keyPath: 'id' })

        const messages = d.createObjectStore('messages', { keyPath: 'id' })
        messages.createIndex('byNode', 'nodeId')

        d.createObjectStore('settings')
      },
    })
  }
  return dbPromise
}

// ---- nodes ----

export async function getNode(id: string): Promise<GraphNode | undefined> {
  return (await db()).get('nodes', id)
}

export async function getAllNodes(): Promise<GraphNode[]> {
  return (await db()).getAll('nodes')
}

export async function getChildren(parentId: string | null): Promise<GraphNode[]> {
  // IndexedDB 索引不能直接按 null 查，根层节点单独捞。
  const all = await getAllNodes()
  return all
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

export async function putNode(node: GraphNode): Promise<void> {
  await (await db()).put('nodes', node)
}

// ---- cross links ----

export async function getAllLinks(): Promise<CrossLink[]> {
  return (await db()).getAll('links')
}

export async function putLink(link: CrossLink): Promise<void> {
  await (await db()).put('links', link)
}

// ---- messages ----

export async function getMessages(nodeId: string): Promise<Message[]> {
  const all = await (await db()).getAllFromIndex('messages', 'byNode', nodeId)
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function getAllMessages(): Promise<Message[]> {
  return (await db()).getAll('messages')
}

export async function putMessage(msg: Message): Promise<void> {
  await (await db()).put('messages', msg)
}

// 云同步用：把一份整图快照原样写回本地（拉取后恢复）。
export async function importSnapshot(snapshot: {
  nodes: GraphNode[]
  links: CrossLink[]
  messages: Message[]
}): Promise<void> {
  const d = await db()
  const tx = d.transaction(['nodes', 'links', 'messages'], 'readwrite')
  await Promise.all([
    ...snapshot.nodes.map((n) => tx.objectStore('nodes').put(n)),
    ...snapshot.links.map((l) => tx.objectStore('links').put(l)),
    ...snapshot.messages.map((m) => tx.objectStore('messages').put(m)),
    tx.done,
  ])
}

// ---- settings (BYOK) ----

export async function loadSettings(): Promise<Settings | null> {
  const d = await db()
  const apiKey = (await d.get('settings', 'apiKey')) as string | undefined
  if (!apiKey) return null
  const provider = ((await d.get('settings', 'provider')) as Settings['provider']) || 'anthropic'
  const baseURL = ((await d.get('settings', 'baseURL')) as string) || ''
  const teacherModel = ((await d.get('settings', 'teacherModel')) as string) || 'claude-sonnet-4-6'
  const observerModel = ((await d.get('settings', 'observerModel')) as string) || 'claude-sonnet-4-6'
  return { provider, baseURL, apiKey, teacherModel, observerModel }
}

export async function saveSettings(s: Settings): Promise<void> {
  const d = await db()
  await d.put('settings', s.provider, 'provider')
  await d.put('settings', s.baseURL, 'baseURL')
  await d.put('settings', s.apiKey, 'apiKey')
  await d.put('settings', s.teacherModel, 'teacherModel')
  await d.put('settings', s.observerModel, 'observerModel')
}

export async function clearAll(): Promise<void> {
  const d = await db()
  await Promise.all([
    d.clear('nodes'),
    d.clear('links'),
    d.clear('messages'),
  ])
}

// ---- 同步码（云同步身份 + 端到端加密口令；只存本地，绝不上传）----

export async function getSyncCode(): Promise<string | null> {
  const code = (await db()).get('settings', 'syncCode')
  return ((await code) as string | undefined) ?? null
}

export async function saveSyncCode(code: string): Promise<void> {
  await (await db()).put('settings', code, 'syncCode')
}

export async function clearSyncCode(): Promise<void> {
  await (await db()).delete('settings', 'syncCode')
}
