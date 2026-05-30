import { useState } from 'react'
import { useStore } from '../store'

// 收拢：把这一层折进一句主干。
// 铁律 1：必须你自己说出这句话 —— AI 只在对的时机用一个问题逼你说，绝不替你印出来。
// 那个问题（observer.collapse.question）问的是连接/预测/压缩，不是定义/复述（铁律 2）。
export function CollapsePrompt() {
  const observer = useStore((s) => s.observer)
  const collapseCurrent = useStore((s) => s.collapseCurrent)
  const [summary, setSummary] = useState('')

  if (!observer || !observer.collapse.should) return null

  async function done() {
    const s = summary.trim()
    if (!s) return
    setSummary('')
    await collapseCurrent(s)
  }

  return (
    <div className="observer-box">
      <div className="collapse-prompt">
        <div className="q">{observer.collapse.question || '用一句话说出这一层的主干。'}</div>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="你自己说 —— 这就是收拢。说不出来，说明还没真懂这一层。"
        />
        <div className="row" style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => void done()} disabled={!summary.trim()}>
            收拢这一层 ⤴
          </button>
        </div>
      </div>
    </div>
  )
}
