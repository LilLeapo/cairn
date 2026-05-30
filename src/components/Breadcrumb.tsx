import { useStore } from '../store'

// 面包屑 = 缩小的方向。点上层 = 收拢视角往回爬。
export function Breadcrumb() {
  const path = useStore((s) => s.path)
  const navigateTo = useStore((s) => s.navigateTo)

  return (
    <div className="crumbs">
      {path.map((n, i) => {
        const last = i === path.length - 1
        return (
          <span key={n.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span className="crumb-sep">/</span>}
            <button
              className={`crumb${last ? ' current' : ''}`}
              onClick={() => !last && void navigateTo(n.id)}
              disabled={last}
              title={n.summary ?? undefined}
            >
              {n.title}
            </button>
          </span>
        )
      })}
    </div>
  )
}
