import { useState, useRef } from 'react'
import { useStore } from '../store'
import { parseChat, type ExportFormat } from '../lib/chatloader'
import { putMessage } from '../db'
import type { Message } from '../types'

export function ImportPanel() {
  const currentId = useStore((s) => s.currentId)
  const navigateTo = useStore((s) => s.navigateTo)
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('codewhale')
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function doImport() {
    if (!text.trim()) return
    setImporting(true)
    setResult(null)
    setErr(null)
    try {
      const turns = parseChat(format, text)
      const base = Date.now()
      const msgs: Message[] = turns.map((t, i) => ({
        id: crypto.randomUUID(),
        nodeId: currentId,
        role: t.role,
        content: t.content,
        createdAt: base + i,
      }))
      for (const m of msgs) await putMessage(m)
      await navigateTo(currentId)
      const { messages: fresh } = useStore.getState()
      void useStore.getState().runObserverLoop(currentId, fresh)
      setResult(`导入 ${msgs.length} 条消息`)
      setText('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  function loadFile() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    const r = new FileReader()
    r.onload = () => { setText(r.result as string); setErr(null) }
    r.readAsText(file)
  }

  const s = { background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 4, padding: '4px 8px', font: 'inherit' }

  return (
    <div>
      <button className="btn ghost" style={{ fontSize: 13 }} onClick={() => setOpen(!open)}>
        {open ? '收起' : '导入对话'}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: 16, zIndex: 100 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>格式</span>
              <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)} style={s}>
                <option value="codewhale">CodeWhale 导出</option>
                <option value="claude">Claude Code 导出</option>
              </select>
              <label className="btn ghost" style={{ fontSize: 12, padding: '4px 8px', cursor: 'pointer', marginLeft: 'auto' }}>
                上传文件
                <input ref={fileRef} type="file" accept=".md,.txt" onChange={loadFile} style={{ display: 'none' }} />
              </label>
            </div>

            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="粘贴导出的对话文本…" rows={14}
              style={{ ...s, width: '100%', padding: 8, fontSize: 13, resize: 'vertical' }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <button className="btn" onClick={doImport} disabled={!text.trim() || importing}>
                {importing ? '导入中…' : '导入'}
              </button>
              {result && <span style={{ fontSize: 13, color: 'var(--explored)' }}>{result}</span>}
              {err && <span style={{ fontSize: 13, color: 'var(--danger)' }}>{err}</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
