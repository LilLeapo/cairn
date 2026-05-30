import { useStore } from '../store'
import type { GraphNode } from '../types'

const STATUS_LABEL: Record<GraphNode['status'], string> = {
  empty: '空 · 提过没钻',
  explored: '已展开',
  collapsed: '已收拢',
}

// 一次只看一层子图。双击节点 = 放大（扩散）钻进子图；面包屑 = 缩小（收拢）爬回去。
// 同一个动作，两个方向。图可以丑，赌的是判断准不准。
export function GraphPanel() {
  const children = useStore((s) => s.children)
  const allNodes = useStore((s) => s.allNodes)
  const allLinks = useStore((s) => s.allLinks)
  const currentId = useStore((s) => s.currentId)
  const navigateTo = useStore((s) => s.navigateTo)

  const byId = new Map(allNodes.map((n) => [n.id, n]))

  // 与当前层相关的横切连接（任一端在当前层的节点集合里）
  const localIds = new Set([currentId, ...children.map((c) => c.id)])
  const links = allLinks.filter((l) => localIds.has(l.fromId) || localIds.has(l.toId))

  return (
    <div>
      {children.length === 0 && (
        <p className="hint">
          这一层还没长出任何点。
          <br />
          往右边问点什么 —— 图是从你的探索里长出来的，不是预先画好的。
        </p>
      )}

      {children.map((n) => (
        <div key={n.id} className={`node-card ${n.status}`}>
          <div className="node-title">
            <button
              onDoubleClick={() => void navigateTo(n.id)}
              onClick={() => void navigateTo(n.id)}
              title="双击钻进去"
            >
              {n.title}
            </button>
            <span className={`badge ${n.status}`}>{STATUS_LABEL[n.status]}</span>
          </div>
          {n.summary && <div className="node-summary">主干：{n.summary}</div>}
        </div>
      ))}

      {links.length > 0 && (
        <div className="links">
          <div style={{ marginBottom: 4 }}>横切连接（把树连成图）：</div>
          {links.map((l) => {
            const from = byId.get(l.fromId)
            const to = byId.get(l.toId)
            if (!from || !to) return null
            return (
              <div key={l.id} className="link-line">
                {from.title} <span className="link-label">— {l.label} →</span> {to.title}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
