import { useState } from 'react'
import { useStore } from '../store'
import { generateSyncCode } from '../sync/crypto'

// 云同步（端到端加密）：整图在浏览器里加密后才上传，服务端只存密文。
// 同步码 = 身份 + 唯一解密钥匙，只存本地、绝不上传；丢了就找不回。
export function SyncPanel() {
  const syncCode = useStore((s) => s.syncCode)
  const syncError = useStore((s) => s.syncError)
  const applySyncCode = useStore((s) => s.applySyncCode)
  const disableSync = useStore((s) => s.disableSync)

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function enableNew() {
    setBusy(true)
    await applySyncCode(generateSyncCode())
    setBusy(false)
  }

  async function connect() {
    if (!input.trim()) return
    setBusy(true)
    await applySyncCode(input.trim())
    setBusy(false)
    setInput('')
  }

  function copy() {
    if (!syncCode) return
    void navigator.clipboard?.writeText(syncCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const fieldStyle = {
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: '8px 10px',
    font: 'inherit',
    fontSize: 13,
  }

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        className="linklike"
        onClick={() => setOpen(!open)}
        title="云同步（端到端加密）"
        style={{ color: syncCode ? 'var(--explored)' : 'var(--accent)' }}
      >
        {syncCode ? '☁ 已同步' : '☁ 同步'}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              width: 'min(440px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 64px)',
              overflowY: 'auto',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: 20,
              zIndex: 100,
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>云同步（端到端加密）</h3>
            <p className="note" style={{ marginTop: 0 }}>
              整张图在你浏览器里加密后才上传，服务端只存密文、看不到内容。
              <b>同步码是唯一的解密钥匙——丢了就找不回，请妥善保存。</b> API key 不会同步。
            </p>

            {syncCode ? (
              <>
                <label
                  style={{ display: 'block', fontSize: 13, color: 'var(--muted)', margin: '14px 0 6px' }}
                >
                  你的同步码（在新设备输入它，即可拉回这张图）
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code
                    style={{
                      ...fieldStyle,
                      flex: 1,
                      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    {syncCode}
                  </code>
                  <button className="btn ghost" onClick={copy}>
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
                <div style={{ marginTop: 16 }}>
                  <button className="btn ghost" onClick={() => void disableSync()}>
                    关闭同步（保留本地图）
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginTop: 14 }}>
                  <button className="btn" onClick={enableNew} disabled={busy}>
                    {busy ? '处理中…' : '生成同步码并开启'}
                  </button>
                </div>
                <p className="note" style={{ textAlign: 'center', margin: '14px 0' }}>
                  —— 或在已有设备拿到同步码后 ——
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="粘贴已有同步码"
                    autoComplete="off"
                    style={{ ...fieldStyle, flex: 1 }}
                  />
                  <button className="btn ghost" onClick={connect} disabled={busy || !input.trim()}>
                    连接并拉取
                  </button>
                </div>
              </>
            )}

            {syncError && (
              <div className="err" style={{ marginTop: 12 }}>
                同步出错：{syncError}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
