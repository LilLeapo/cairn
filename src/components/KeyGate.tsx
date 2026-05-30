import { useState } from 'react'
import { useStore } from '../store'
import { testKey } from '../anthropic'

// BYOK 门：用户粘自己的 key，存进 IndexedDB，前端直连。
// 你（产品）从头到尾不碰任何人的 key。
export function KeyGate() {
  const setSettings = useStore((s) => s.setSettings)
  const [apiKey, setApiKey] = useState('')
  const [teacherModel, setTeacherModel] = useState('claude-sonnet-4-6')
  const [observerModel, setObserverModel] = useState('claude-sonnet-4-6')
  const [testing, setTesting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function check() {
    setTesting(true)
    setErr(null)
    setOk(false)
    const e = await testKey(apiKey.trim(), teacherModel.trim())
    setTesting(false)
    if (e) setErr(e)
    else setOk(true)
  }

  async function enter() {
    await setSettings({
      apiKey: apiKey.trim(),
      teacherModel: teacherModel.trim(),
      observerModel: observerModel.trim(),
    })
  }

  return (
    <div className="gate">
      <h1>Cairn</h1>
      <p className="tag">
        显化你和 AI 学习时的探索过程本身，并在该收的时候帮你收。
        <br />
        纯前端、本地优先：你的 key 和你的图都只存在这台机器上，从不上传。
      </p>

      <label>你的 Anthropic API Key（BYOK）</label>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="sk-ant-..."
        autoComplete="off"
      />
      <p className="note">
        存进浏览器的 IndexedDB，直连 api.anthropic.com。我们不碰它。
        换机器要重新填。
      </p>

      <label>老师模型</label>
      <input value={teacherModel} onChange={(e) => setTeacherModel(e.target.value)} />
      <label>观察者模型</label>
      <input value={observerModel} onChange={(e) => setObserverModel(e.target.value)} />
      <p className="note">
        ⚠️ 模型名按需核对 docs.claude.com 的当前 ID。观察者是判断引擎，预算够可换更强的模型。
      </p>

      {err && <div className="err">连接失败：{err}</div>}
      {ok && <div className="ok">连接正常 ✓</div>}

      <div className="row">
        <button className="btn ghost" onClick={check} disabled={!apiKey.trim() || testing}>
          {testing ? '测试中…' : '测试连接'}
        </button>
        <button className="btn" onClick={enter} disabled={!apiKey.trim()}>
          进入
        </button>
      </div>
    </div>
  )
}
