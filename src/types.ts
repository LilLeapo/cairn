// Cairn 的数据模型 —— 产品 IP 的一半（另一半是观察者 prompt）。
// 一张递归嵌套的图：每个节点双击进去是一张子图，地图套地图。
// 纯嵌套是树，所以另有横切连接（CrossLink）把它变成 graph。

export type NodeStatus =
  | 'empty' // 提过、但从没真懂 —— "空"本身就是信息
  | 'explored' // 钻进去聊过、长出过东西
  | 'collapsed' // 已收拢：一层被折进它的标题（summary 存在）

export interface GraphNode {
  id: string
  parentId: string | null // null = 根层节点
  title: string // 这一层 / 这个点的标题（也是收拢后的"主干"标签）
  summary: string | null // 收拢时你亲口说的那句主干。null = 还没收。AI 绝不替你填这里
  status: NodeStatus
  bornFrom: string | null // 哪条消息让它长出来的（messageId），溯源用
  order: number
  createdAt: number
}

// 横切连接：跨子图的线。tree 变 graph 的命门。
// 例："带宽"是主干、"KV 缓存分页 ≈ OS 分页"
export interface CrossLink {
  id: string
  fromId: string
  toId: string
  label: string // 关系标签，如 "≈"、"是主干"、"依赖"
  createdAt: number
}

// 每个节点有自己的一段对话（这一层的局部对话）。
export interface Message {
  id: string
  nodeId: string // 这一轮属于哪张子图
  role: 'user' | 'teacher'
  content: string
  createdAt: number
}

// 观察者对"当前这一层"的最新解读：提的方向 + 该不该收的信号。
// 这是核心循环的产物，不入库长期保存，随对话刷新。
export interface DirectionSuggestion {
  title: string
  rationale: string // 为什么值得展开
  depth: 'subgraph' | 'inline' // AI 默认自己猜的深浅（rule 3：默认 AI 猜）
  loadBearing: boolean // 是不是承重的岔路口 —— 只有它为 true，才该把选择权抛给你
}

export interface CollapseNudge {
  should: boolean // 现在该收了吗
  reason: string // 为什么该收 / 还不该收
  question: string // 该收时，逼你用一句话说出主干的那个问题（rule 1：AI 绝不替你说出主干）
}

export interface ObserverRead {
  nodeId: string
  directions: DirectionSuggestion[]
  collapse: CollapseNudge
  updatedAt: number
}

// 设置：BYOK —— 你自己的 key，存在本地，前端直连，从不上传。
export interface Settings {
  apiKey: string
  teacherModel: string
  observerModel: string
}
