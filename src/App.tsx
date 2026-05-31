import { useEffect } from 'react'
import { useStore } from './store'
import { KeyGate } from './components/KeyGate'
import { Breadcrumb } from './components/Breadcrumb'
import { GraphPanel } from './components/GraphPanel'
import { Chat } from './components/Chat'
import { ImportPanel } from './components/ImportPanel'

export function App() {
  const ready = useStore((s) => s.ready)
  const settings = useStore((s) => s.settings)
  const init = useStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) return <div className="spin" style={{ padding: 24 }}>载入本地图谱…</div>
  if (!settings) return <KeyGate />

  return (
    <div className="app">
      <div className="col">
        <div className="col-head">
          <Breadcrumb />
          <ImportPanel />
        </div>
        <div className="col-body">
          <GraphPanel />
        </div>
      </div>
      <Chat />
    </div>
  )
}
