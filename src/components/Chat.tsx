import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { DirectionChips } from './DirectionChips'
import { CollapsePrompt } from './CollapsePrompt'

export function Chat() {
  const messages = useStore((s) => s.messages)
  const streaming = useStore((s) => s.streaming)
  const thinking = useStore((s) => s.thinking)
  const error = useStore((s) => s.error)
  const send = useStore((s) => s.send)
  const resetAll = useStore((s) => s.resetAll)

  const [text, setText] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  const busy = streaming !== null || thinking

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [messages, streaming, thinking])

  async function submit() {
    const t = text.trim()
    if (!t || busy) return
    setText('')
    await send(t)
  }

  return (
    <div className="col">
      <div className="col-head">
        <span>对话</span>
        {thinking && <span className="spin">· 观察者在解读这一层…</span>}
        <button
          className="linklike"
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            if (confirm('清空整张图和所有对话？key 会保留。')) void resetAll()
          }}
        >
          清空
        </button>
      </div>

      <div className="col-body" ref={bodyRef}>
        {messages.length === 0 && !streaming && (
          <p className="hint">
            问点你想搞懂的东西。老师会答；与此同时，一个你看不见的观察者会把你的探索画成图，
            在该往深走时给你方向、在该收的时候逼你自己收。
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role === 'teacher' && <div className="who">老师</div>}
            {m.content}
          </div>
        ))}

        {streaming !== null && (
          <div className="msg teacher">
            <div className="who">老师</div>
            {streaming || '…'}
          </div>
        )}

        {error && <div className="err">出错了：{error}</div>}
      </div>

      <CollapsePrompt />
      <DirectionChips />

      <div className="composer">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder={busy ? '等一下…' : '问点什么（Enter 发送，Shift+Enter 换行）'}
          disabled={busy}
        />
        <button className="btn" onClick={() => void submit()} disabled={busy || !text.trim()}>
          发送
        </button>
      </div>
    </div>
  )
}
