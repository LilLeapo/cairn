import { useStore } from '../store'
import type { GraphNode, NodeStatus } from '../types'

const STATUS_LABEL: Record<NodeStatus, string> = {
  empty: '空 · 提过没钻',
  explored: '已展开',
  collapsed: '已收拢',
}

interface Zone {
  ids: string[]
  labels: string[] // 这个关联区里出现过的关系标签（去重）
  pairs: string[] // "A ≈ B" 形式，供 hover 看明细
}

// MN4 式分块分区：关联不画线，而是把有关联的卡片圈进同一个"关联区"。
// 节点是卡片，点卡片钻进它的子图（放大＝扩散），面包屑回上层（缩小＝收拢）。
export function GraphPanel() {
  const current = useStore((s) => s.path[s.path.length - 1])
  const allNodes = useStore((s) => s.allNodes)
  const allLinks = useStore((s) => s.allLinks)
  const children = useStore((s) => s.children)
  const navigateTo = useStore((s) => s.navigateTo)

  const hasKids = (id: string) => allNodes.some((n) => n.parentId === id)
  const childById = new Map(children.map((c) => [c.id, c]))
  const visible = new Set(children.map((c) => c.id))

  // 兄弟卡片之间的横切连接 → 邻接表
  const adj = new Map<string, { to: string; label: string }[]>()
  for (const l of allLinks) {
    if (l.fromId === l.toId) continue
    if (!visible.has(l.fromId) || !visible.has(l.toId)) continue
    ;(adj.get(l.fromId) ?? adj.set(l.fromId, []).get(l.fromId)!).push({ to: l.toId, label: l.label })
    ;(adj.get(l.toId) ?? adj.set(l.toId, []).get(l.toId)!).push({ to: l.fromId, label: l.label })
  }

  // 连通分量 = 关联区。单点（无关联）归入"其他"。
  const seen = new Set<string>()
  const zones: Zone[] = []
  for (const c of children) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    if (!adj.has(c.id)) continue // 孤立卡片
    const ids: string[] = []
    const labelSet = new Set<string>()
    const pairSet = new Set<string>()
    const stack = [c.id]
    while (stack.length) {
      const id = stack.pop()!
      ids.push(id)
      for (const e of adj.get(id) ?? []) {
        labelSet.add(e.label)
        const a = childById.get(id)?.title ?? id
        const b = childById.get(e.to)?.title ?? e.to
        pairSet.add([a, b].sort().join(` ${e.label} `))
        if (!seen.has(e.to)) {
          seen.add(e.to)
          stack.push(e.to)
        }
      }
    }
    if (ids.length >= 2) zones.push({ ids, labels: [...labelSet], pairs: [...pairSet] })
  }
  const grouped = new Set(zones.flatMap((z) => z.ids))
  const others = children.filter((c) => !grouped.has(c.id))

  function Card({ n }: { n: GraphNode }) {
    return (
      <div
        className={`card ${n.status}`}
        onClick={() => void navigateTo(n.id)}
        title={n.summary ? `主干：${n.summary}` : STATUS_LABEL[n.status]}
      >
        <div className="card-title">{n.title}</div>
        <div className="card-meta">
          <span className={`badge ${n.status}`}>{STATUS_LABEL[n.status]}</span>
          {hasKids(n.id) && <span className="card-drill">⤵ 钻入</span>}
        </div>
        {n.summary && <div className="card-summary">主干：{n.summary}</div>}
      </div>
    )
  }

  return (
    <div className="board">
      {current && (
        <div className="board-head">
          <span className="board-title">{current.title}</span>
          {current.summary && <span className="board-sub">主干：{current.summary}</span>}
        </div>
      )}

      {children.length === 0 && (
        <p className="hint">
          这一层还没长出任何点。
          <br />
          往右边问点什么 —— 图是从你的探索里长出来的。
        </p>
      )}

      {zones.map((z, i) => (
        <div className="zone" key={i}>
          <div className="zone-head" title={z.pairs.join('\n')}>
            <span className="zone-tag">关联区</span>
            <span className="zone-rel">{z.labels.join(' · ')}</span>
          </div>
          <div className="zone-cards">
            {z.ids.map((id) => {
              const n = childById.get(id)
              return n ? <Card n={n} key={id} /> : null
            })}
          </div>
        </div>
      ))}

      {others.length > 0 && (
        <div className="others">
          {zones.length > 0 && <div className="others-head">其他</div>}
          <div className="zone-cards">
            {others.map((n) => (
              <Card n={n} key={n.id} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
