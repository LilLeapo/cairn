import { useStore } from '../store'
import type { DirectionSuggestion } from '../types'

// 核心循环的发动机：观察者提方向 → 你决定推不推 → 推就钻进去，不推就晾着。
// rule 3：绝大多数方向 AI 自己猜了深浅，你一点就走；
// 只有承重的岔路口（loadBearing）才把"开子图 / 一笔带过"的选择权抛给你。
export function DirectionChips() {
  const observer = useStore((s) => s.observer)
  const apply = useStore((s) => s.applyDirection)

  if (!observer || observer.directions.length === 0) return null

  return (
    <div className="observer-box">
      <h4>可以往哪走 —— 你定</h4>
      {observer.directions.map((d, i) =>
        d.loadBearing ? (
          <Fork key={i} d={d} onPick={(depth) => void apply(d, depth)} />
        ) : (
          <button
            key={i}
            className={`chip ${d.depth}`}
            title={d.rationale}
            onClick={() => void apply(d)}
          >
            {d.title}
            <span className="depth">{d.depth === 'subgraph' ? '开子图 ⤵' : '一笔带过'}</span>
          </button>
        ),
      )}
    </div>
  )
}

// 承重岔路口：选哪边会显著改变接下来的路径，AI 不替你拍板。
function Fork({
  d,
  onPick,
}: {
  d: DirectionSuggestion
  onPick: (depth: 'subgraph' | 'inline') => void
}) {
  return (
    <div className="fork">
      <div className="q">
        <strong>{d.title}</strong> —— {d.rationale}
        <br />
        这是个承重的岔路口，你来定深浅：
      </div>
      <div className="actions">
        <button className="btn" onClick={() => onPick('subgraph')}>
          开成子图 ⤵
        </button>
        <button className="btn ghost" onClick={() => onPick('inline')}>
          一笔带过
        </button>
      </div>
    </div>
  )
}
