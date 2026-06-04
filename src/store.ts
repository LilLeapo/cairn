import { create } from 'zustand'
import type {
  GraphNode,
  CrossLink,
  Message,
  Settings,
  ObserverRead,
  DirectionSuggestion,
} from './types'
import * as db from './db'
import { streamTeacher, runObserver, type PathStep } from './llm'
import { pull, pushNow, applySnapshot, schedulePush } from './sync'

const ROOT_ID = 'root'

function uid() {
  return crypto.randomUUID()
}

function norm(s: string) {
  return s.trim().toLowerCase()
}

interface State {
  ready: boolean
  settings: Settings | null

  // 全量镜像，渲染 + 横切连接对齐用
  allNodes: GraphNode[]
  allLinks: CrossLink[]

  // 当前所在层
  currentId: string
  path: GraphNode[] // 根 → 当前
  children: GraphNode[] // 当前层的子节点
  messages: Message[] // 当前层的对话

  observer: ObserverRead | null
  streaming: string | null // 老师正在流式输出的临时文本
  thinking: boolean // 观察者正在解读
  error: string | null

  // 云同步：同步码只存本地（端到端加密口令），整图加密后镜像到 KV
  syncCode: string | null
  syncError: string | null

  init: () => Promise<void>
  setSettings: (s: Settings) => Promise<void>
  navigateTo: (id: string) => Promise<void>
  send: (text: string) => Promise<void>
  runObserverLoop: (currentId: string, newMessages: Message[]) => Promise<void>
  applyDirection: (d: DirectionSuggestion, depthOverride?: 'subgraph' | 'inline') => Promise<void>
  collapseCurrent: (summary: string) => Promise<void>
  resetAll: () => Promise<void>
  applySyncCode: (code: string) => Promise<void>
  disableSync: () => Promise<void>
}

// 写操作后触发防抖上传（只在开了同步时）。同步是尽力而为，出错只记一条。
function autoSync(get: () => State, set: (p: Partial<State>) => void) {
  const code = get().syncCode
  if (code) schedulePush(code, (msg) => set({ syncError: msg }))
}

async function buildPath(nodeId: string, all: GraphNode[]): Promise<GraphNode[]> {
  const byId = new Map(all.map((n) => [n.id, n]))
  const chain: GraphNode[] = []
  let cur: GraphNode | undefined = byId.get(nodeId)
  while (cur) {
    chain.unshift(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return chain
}

function toPathSteps(path: GraphNode[]): PathStep[] {
  return path.map((n) => ({ title: n.title, summary: n.summary }))
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  settings: null,
  allNodes: [],
  allLinks: [],
  currentId: ROOT_ID,
  path: [],
  children: [],
  messages: [],
  observer: null,
  streaming: null,
  thinking: false,
  error: null,
  syncCode: null,
  syncError: null,

  init: async () => {
    const settings = await db.loadSettings()
    const syncCode = await db.getSyncCode()

    // 确保有根节点。根节点 = 整张图的入口，标题就叫"我在学的东西"，等第一条消息再说。
    let root = await db.getNode(ROOT_ID)
    if (!root) {
      root = {
        id: ROOT_ID,
        parentId: null,
        title: '我在学的东西',
        summary: null,
        status: 'explored',
        bornFrom: null,
        order: 0,
        createdAt: Date.now(),
      }
      await db.putNode(root)
    }

    // 新设备 / 本地是空图，且本机存了同步码 → 先从云端拉回整图再渲染
    if (syncCode) {
      try {
        const [localMsgs, localNodes] = await Promise.all([db.getAllMessages(), db.getAllNodes()])
        if (localMsgs.length === 0 && localNodes.length <= 1) {
          const snap = await pull(syncCode)
          if (snap) await applySnapshot(snap)
        }
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : String(e) })
      }
    }

    const allNodes = await db.getAllNodes()
    const allLinks = await db.getAllLinks()
    const path = await buildPath(ROOT_ID, allNodes)
    const children = await db.getChildren(ROOT_ID)
    const messages = await db.getMessages(ROOT_ID)
    set({
      ready: true,
      settings,
      syncCode,
      allNodes,
      allLinks,
      currentId: ROOT_ID,
      path,
      children,
      messages,
    })
  },

  setSettings: async (s) => {
    await db.saveSettings(s)
    set({ settings: s })
  },

  navigateTo: async (id) => {
    const allNodes = await db.getAllNodes()
    const path = await buildPath(id, allNodes)
    const children = await db.getChildren(id)
    const messages = await db.getMessages(id)
    set({ currentId: id, path, children, messages, observer: null, allNodes })
  },

  send: async (text) => {
    const { settings, currentId, path, messages } = get()
    if (!settings) return
    set({ error: null })

    const userMsg: Message = {
      id: uid(),
      nodeId: currentId,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    }
    await db.putMessage(userMsg)
    set({ messages: [...messages, userMsg], streaming: '' })

    // 老师循环：流式回答
    let answer = ''
    try {
      answer = await streamTeacher(settings, {
        path: toPathSteps(path),
        history: messages,
        userText: text,
        onDelta: (chunk) => set((st) => ({ streaming: (st.streaming ?? '') + chunk })),
      })
    } catch (e) {
      set({ streaming: null, error: e instanceof Error ? e.message : String(e) })
      return
    }

    const teacherMsg: Message = {
      id: uid(),
      nodeId: currentId,
      role: 'teacher',
      content: answer,
      createdAt: Date.now(),
    }
    await db.putMessage(teacherMsg)
    const newMessages = [...get().messages, teacherMsg]
    set({ messages: newMessages, streaming: null, thinking: true })
    autoSync(get, set)

    // 观察者循环：解读这一层，让图生长，提方向，判断该不该收
    void get().runObserverLoop(currentId, newMessages)
  },

  runObserverLoop: async (currentId: string, newMessages: Message[]) => {
    // 观察者循环：解读这一层，让图生长，提方向，判断该不该收
    const { settings } = get()
    try {
      const children = await db.getChildren(currentId)
      const result = await runObserver(settings!, {
        path: toPathSteps(get().path),
        childrenTitles: children.map((c) => c.title),
        history: newMessages,
      })
      if (result) await applyObserver(currentId, result, set, get)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ thinking: false })
    }
  },

  applyDirection: async (d, depthOverride) => {
    const { currentId, children } = get()
    const depth = depthOverride ?? d.depth

    // 节点是探索长出来的：方向只有你点了才落成节点（你决定推不推进）。
    const existing = children.find((c) => norm(c.title) === norm(d.title))
    let node = existing
    if (!node) {
      node = {
        id: uid(),
        parentId: currentId,
        title: d.title,
        summary: null,
        status: 'empty', // 刚落下还没钻过 —— "空"本身是信息
        bornFrom: null,
        order: children.length,
        createdAt: Date.now(),
      }
      await db.putNode(node)
    }

    if (depth === 'subgraph') {
      // 放大 = 扩散：钻进去成为新的当前层
      await get().navigateTo(node.id)
    } else {
      // inline / 一笔带过：只在当前层留一个空点，不钻进去
      const allNodes = await db.getAllNodes()
      set({ allNodes, children: await db.getChildren(currentId) })
    }
    autoSync(get, set)
  },

  collapseCurrent: async (summary) => {
    // 铁律 1：收拢必须用户自己来。这里写进去的 summary 永远来自用户输入，绝不来自 AI。
    const { currentId, path } = get()
    const node = await db.getNode(currentId)
    if (!node) return
    const collapsed: GraphNode = { ...node, summary, status: 'collapsed' }
    await db.putNode(collapsed)

    // 收完缩小 = 回到上一层
    const parentId = node.parentId
    const allNodes = await db.getAllNodes()
    set({ allNodes, observer: null })
    if (parentId) {
      await get().navigateTo(parentId)
    } else {
      // 根层：收拢后留在原地，刷新
      const children = await db.getChildren(currentId)
      set({ path: await buildPath(currentId, allNodes), children })
    }
    autoSync(get, set)
    void path
  },

  resetAll: async () => {
    await db.clearAll()
    set({ allNodes: [], allLinks: [], observer: null, messages: [], children: [] })
    await get().init()
    await get().navigateTo(ROOT_ID)
  },

  // 开启 / 连接云同步：填入同步码。云端已有快照就拉回（云为准）；没有就把本地播种上去。
  applySyncCode: async (code) => {
    const c = code.trim()
    if (!c) return
    await db.saveSyncCode(c)
    set({ syncCode: c, syncError: null })
    try {
      const snap = await pull(c)
      if (snap) {
        await applySnapshot(snap)
      } else {
        await pushNow(c)
      }
      const allNodes = await db.getAllNodes()
      const allLinks = await db.getAllLinks()
      set({ allNodes, allLinks })
      await get().navigateTo(ROOT_ID)
    } catch (e) {
      set({ syncError: e instanceof Error ? e.message : String(e) })
    }
  },

  // 关闭云同步：只清掉本机的同步码，本地图原样保留。
  disableSync: async () => {
    await db.clearSyncCode()
    set({ syncCode: null, syncError: null })
  },
}))

// 把观察者结果对齐进图：长出概念点、连横切线、记下方向与收拢信号。
async function applyObserver(
  nodeId: string,
  r: Awaited<ReturnType<typeof runObserver>>,
  set: (partial: Partial<State>) => void,
  get: () => State,
) {
  if (!r) return

  // 1. nodes —— 对话里真正冒出来的概念，落成当前层的子节点（图从探索里长出来）
  const existingChildren = await db.getChildren(nodeId)
  const byTitle = new Map(existingChildren.map((c) => [norm(c.title), c]))
  let order = existingChildren.length
  for (const n of r.nodes) {
    const hit = byTitle.get(norm(n.title))
    if (hit) {
      // 已存在：状态只升不降（empty → explored）
      if (hit.status === 'empty' && n.status === 'explored') {
        await db.putNode({ ...hit, status: 'explored' })
      }
    } else {
      const created: GraphNode = {
        id: uid(),
        parentId: nodeId,
        title: n.title,
        summary: null,
        status: n.status,
        bornFrom: null,
        order: order++,
        createdAt: Date.now(),
      }
      await db.putNode(created)
      byTitle.set(norm(created.title), created)
    }
  }

  // 2. crossLinks —— 跨子图的横切连接（tree → graph）。按标题在全图里对齐两端。
  const allNodes = await db.getAllNodes()
  const titleIndex = new Map<string, GraphNode>()
  for (const n of allNodes) titleIndex.set(norm(n.title), n)
  const existingLinks = await db.getAllLinks()
  const linkKey = (a: string, b: string) => [a, b].sort().join('::')
  const seen = new Set(existingLinks.map((l) => linkKey(l.fromId, l.toId)))
  for (const cl of r.crossLinks) {
    const from = titleIndex.get(norm(cl.from))
    const to = titleIndex.get(norm(cl.to))
    if (!from || !to || from.id === to.id) continue
    if (seen.has(linkKey(from.id, to.id))) continue
    const link: CrossLink = {
      id: uid(),
      fromId: from.id,
      toId: to.id,
      label: cl.label,
      createdAt: Date.now(),
    }
    await db.putLink(link)
    seen.add(linkKey(from.id, to.id))
  }

  // 3. directions + collapse —— 核心循环的产物，刷新到当前层
  const observer: ObserverRead = {
    nodeId,
    directions: r.directions,
    collapse: r.collapse,
    updatedAt: Date.now(),
  }

  set({
    allNodes: await db.getAllNodes(),
    allLinks: await db.getAllLinks(),
    children: await db.getChildren(nodeId),
    observer: get().currentId === nodeId ? observer : get().observer,
  })
  autoSync(get, set)
}
