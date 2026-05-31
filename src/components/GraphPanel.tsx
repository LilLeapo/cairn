import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type WheelEvent as RWheelEvent,
} from 'react'
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type Simulation,
} from 'd3-force'
import { useStore } from '../store'
import type { NodeStatus } from '../types'

const COLOR: Record<NodeStatus, string> = {
  empty: '#6b7280',
  explored: '#7bd88f',
  collapsed: '#c9a26d',
}
const STATUS_LABEL: Record<NodeStatus, string> = {
  empty: '空 · 提过没钻',
  explored: '已展开',
  collapsed: '已收拢',
}

interface SimNode {
  id: string
  title: string
  status: NodeStatus
  isHub: boolean
  hasChildren: boolean
  summary: string | null
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}
interface SimLink {
  source: string | SimNode
  target: string | SimNode
  kind: 'tree' | 'cross'
  label?: string
}

// 一次只看一层子图，但渲染成真正的力导向图：
// 中心是当前节点(hub)，四周是子节点，横切连接是带标签的连线。
// 点子节点 = 钻进去(放大/扩散)；点中心 = 回上层(缩小/收拢)。
// 图可以丑，赌的是判断准不准——但至少它现在是图，不是清单了。
export function GraphPanel() {
  const currentId = useStore((s) => s.currentId)
  const allNodes = useStore((s) => s.allNodes)
  const allLinks = useStore((s) => s.allLinks)
  const children = useStore((s) => s.children)
  const navigateTo = useStore((s) => s.navigateTo)

  const wrapRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<SimNode[]>([])
  const linksRef = useRef<SimLink[]>([])
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null)
  const sizeRef = useRef({ w: 600, h: 600 })
  const needFitRef = useRef(true)
  const prevLevelRef = useRef<string | null>(null)
  const [, setTick] = useState(0)
  const [size, setSize] = useState({ w: 600, h: 600 })
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  // 横切连接的标签默认不显示，点了那条线才显示。key = fromId::toId
  const [shownLabels, setShownLabels] = useState<Set<string>>(new Set())

  // 跟随容器尺寸
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const apply = () => {
      const s = { w: el.clientWidth, h: el.clientHeight }
      sizeRef.current = s
      setSize(s)
    }
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    apply()
    return () => ro.disconnect()
  }, [])

  // 自动缩放，使整张图刚好框进视口（进入新一层时调用）
  function fit() {
    const ns = nodesRef.current.filter((n) => n.x != null && n.y != null)
    if (!ns.length) return
    const xs = ns.map((n) => n.x!)
    const ys = ns.map((n) => n.y!)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const gw = maxX - minX || 1
    const gh = maxY - minY || 1
    const pad = 140 // 给节点下方的文字标签留白
    const { w, h } = sizeRef.current
    const k = Math.min(1.6, Math.max(0.3, Math.min(w / (gw + pad), h / (gh + pad))))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setView({ k, x: -cx * k, y: -cy * k })
  }

  const current = allNodes.find((n) => n.id === currentId)

  // 数据变了就重建力导向布局（保留已有节点位置，避免乱跳）
  const childIds = children.map((c) => c.id).join(',')
  const linkIds = allLinks.map((l) => l.id).join(',')
  useEffect(() => {
    if (!current) return
    // 进入新一层：标记需要自动 fit，并清掉上一层残留的标签显示
    if (prevLevelRef.current !== current.id) {
      needFitRef.current = true
      prevLevelRef.current = current.id
      setShownLabels(new Set())
    }
    const visible = new Set([current.id, ...children.map((c) => c.id)])
    const hasKids = (id: string) => allNodes.some((n) => n.parentId === id)

    const nodes: SimNode[] = [
      {
        id: current.id,
        title: current.title,
        status: current.status,
        isHub: true,
        hasChildren: true,
        summary: current.summary,
      },
      ...children.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        isHub: false,
        hasChildren: hasKids(c.id),
        summary: c.summary,
      })),
    ]
    // 种子位置：老节点沿用旧坐标，新节点撒在中心附近
    for (const n of nodes) {
      const p = posRef.current.get(n.id)
      if (p) {
        n.x = p.x
        n.y = p.y
      } else if (n.isHub) {
        n.x = 0
        n.y = 0
      } else {
        n.x = (nodes.length % 7) * 30 - 90
        n.y = (nodes.indexOf(n) % 5) * 30 - 60
      }
    }

    const links: SimLink[] = []
    // 层级边：当前节点 → 每个子节点
    for (const c of children) links.push({ source: current.id, target: c.id, kind: 'tree' })
    // 横切边：两端都在当前可见集合里
    for (const l of allLinks) {
      if (visible.has(l.fromId) && visible.has(l.toId) && l.fromId !== l.toId) {
        links.push({ source: l.fromId, target: l.toId, kind: 'cross', label: l.label })
      }
    }

    nodesRef.current = nodes
    linksRef.current = links

    simRef.current?.stop()
    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force('charge', forceManyBody().strength(-950))
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => (l.kind === 'cross' ? 230 : 160))
          .strength((l) => (l.kind === 'cross' ? 0.18 : 0.6)),
      )
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<SimNode>(76))
      .on('tick', () => {
        for (const n of nodes) if (n.x != null && n.y != null) posRef.current.set(n.id, { x: n.x, y: n.y })
        setTick((t) => t + 1)
      })
      .on('end', () => {
        if (needFitRef.current) {
          needFitRef.current = false
          fit()
        }
      })
    simRef.current = sim
    return () => {
      sim.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, childIds, linkIds])

  // 屏幕坐标 → 仿真坐标
  function toSim(clientX: number, clientY: number) {
    const rect = wrapRef.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left - (size.w / 2 + view.x)) / view.k,
      y: (clientY - rect.top - (size.h / 2 + view.y)) / view.k,
    }
  }

  // 节点拖拽 / 点击
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null)
  function onNodeDown(e: RPointerEvent, n: SimNode) {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragRef.current = { id: n.id, moved: false }
    simRef.current?.alphaTarget(0.2).restart()
    n.fx = n.x
    n.fy = n.y
  }
  function onNodeMove(e: RPointerEvent, n: SimNode) {
    if (dragRef.current?.id !== n.id) return
    dragRef.current.moved = true
    const p = toSim(e.clientX, e.clientY)
    n.fx = p.x
    n.fy = p.y
    setTick((t) => t + 1)
  }
  function onNodeUp(e: RPointerEvent, n: SimNode) {
    if (dragRef.current?.id !== n.id) return
    const wasDrag = dragRef.current.moved
    dragRef.current = null
    n.fx = null
    n.fy = null
    simRef.current?.alphaTarget(0)
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    if (!wasDrag) {
      // 点击：子节点钻进去；中心回上层
      if (!n.isHub) void navigateTo(n.id)
      else if (current?.parentId) void navigateTo(current.parentId)
    }
  }

  // 背景平移 + 滚轮缩放
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null)
  function onBgDown(e: RPointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    panRef.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
  }
  function onBgMove(e: RPointerEvent) {
    if (!panRef.current) return
    setView((v) => ({
      ...v,
      x: panRef.current!.vx + (e.clientX - panRef.current!.sx),
      y: panRef.current!.vy + (e.clientY - panRef.current!.sy),
    }))
  }
  function onBgUp(e: RPointerEvent) {
    panRef.current = null
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  }
  function onWheel(e: RWheelEvent) {
    const rect = wrapRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left - size.w / 2
    const sy = e.clientY - rect.top - size.h / 2
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const k = Math.min(2.5, Math.max(0.3, view.k * factor))
    // 让光标下的点保持不动
    const wx = (sx - view.x) / view.k
    const wy = (sy - view.y) / view.k
    setView({ k, x: sx - wx * k, y: sy - wy * k })
  }

  function toggleLabel(e: { stopPropagation(): void }, key: string) {
    e.stopPropagation()
    setShownLabels((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const nodes = nodesRef.current
  const links = linksRef.current
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const resolve = (e: string | SimNode) => (typeof e === 'string' ? byId.get(e) : e)

  return (
    <div className="graph-wrap" ref={wrapRef}>
      <svg
        width={size.w}
        height={size.h}
        onPointerDown={onBgDown}
        onPointerMove={onBgMove}
        onPointerUp={onBgUp}
        onWheel={onWheel}
        style={{ cursor: panRef.current ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        <g transform={`translate(${size.w / 2 + view.x},${size.h / 2 + view.y}) scale(${view.k})`}>
          {/* 边 */}
          {links.map((l, i) => {
            const a = resolve(l.source)
            const b = resolve(l.target)
            if (!a || !b || a.x == null || b.x == null) return null

            // 层级边：低调的实线，不可点
            if (l.kind !== 'cross') {
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#2c313a"
                  strokeWidth={1}
                />
              )
            }

            // 横切边：标签默认隐藏，点中点小圆 / 点线 才显示
            const mx = (a.x! + b.x!) / 2
            const my = (a.y! + b.y!) / 2
            const key = `${a.id}::${b.id}`
            const shown = shownLabels.has(key)
            return (
              <g key={i}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#c9a26d"
                  strokeOpacity={shown ? 0.9 : 0.4}
                  strokeWidth={shown ? 1.6 : 1.2}
                  strokeDasharray="4 3"
                />
                {/* 透明的加宽命中区，方便点中线 */}
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={16}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => toggleLabel(e, key)}
                />
                {/* 中点小圆：可点的提示，告诉你这条线有内容 */}
                <circle
                  cx={mx}
                  cy={my}
                  r={shown ? 4 : 3}
                  fill="#c9a26d"
                  fillOpacity={shown ? 1 : 0.6}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => toggleLabel(e, key)}
                />
                {shown && l.label && (
                  <text
                    x={mx}
                    y={my - 8}
                    fill="#e0c79a"
                    fontSize={12}
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    {l.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* 节点 */}
          {nodes.map((n) => {
            const r = n.isHub ? 13 : 9
            const color = COLOR[n.status]
            return (
              <g
                key={n.id}
                transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => onNodeDown(e, n)}
                onPointerMove={(e) => onNodeMove(e, n)}
                onPointerUp={(e) => onNodeUp(e, n)}
              >
                <title>
                  {STATUS_LABEL[n.status]}
                  {n.summary ? `\n主干：${n.summary}` : ''}
                  {n.hasChildren && !n.isHub ? '\n（有子图，点进去）' : ''}
                </title>
                {/* 有子图的节点加一圈外环，提示可钻入 */}
                {n.hasChildren && !n.isHub && (
                  <circle r={r + 4} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1} />
                )}
                <circle
                  r={r}
                  fill={n.status === 'empty' ? 'none' : color}
                  stroke={color}
                  strokeWidth={n.isHub ? 2.5 : 1.8}
                  strokeDasharray={n.status === 'empty' ? '3 2' : undefined}
                  fillOpacity={n.isHub ? 0.25 : 0.9}
                />
                <text
                  y={r + 15}
                  textAnchor="middle"
                  fill={n.isHub ? '#e6e8ec' : '#c4ccd8'}
                  fontSize={n.isHub ? 14 : 12.5}
                  fontWeight={n.isHub ? 700 : 500}
                  style={{ pointerEvents: 'none' }}
                >
                  {n.title}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {children.length === 0 && (
        <div className="graph-empty">
          这一层还没长出任何点。
          <br />
          往右边问点什么 —— 图是从你的探索里长出来的。
        </div>
      )}

      <div className="graph-legend">
        <span>
          <i style={{ background: COLOR.explored }} /> 已展开
        </span>
        <span>
          <i style={{ borderColor: COLOR.empty, background: 'transparent' }} /> 空
        </span>
        <span>
          <i style={{ background: COLOR.collapsed }} /> 已收拢
        </span>
        <span className="dim">点子节点钻入 · 点中心回上层 · 点连线看关系 · 滚轮缩放 · 拖拽排布</span>
      </div>
    </div>
  )
}
