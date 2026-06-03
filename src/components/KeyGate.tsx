import { useState } from 'react'
import { useStore } from '../store'
import { testKey } from '../llm'
import type { Provider } from '../types'

const DEFAULTS: Record<Provider, { teacher: string; observer: string; base: string; hint: string }> = {
  anthropic: {
    teacher: 'claude-sonnet-4-6',
    observer: 'claude-sonnet-4-6',
    base: 'https://api.anthropic.com（留空即用官方）',
    hint: '官方或任何 Anthropic 兼容 / 代理端点。',
  },
  openai: {
    teacher: 'gpt-4o',
    observer: 'gpt-4o',
    base: 'https://api.openai.com/v1（留空即用官方）',
    hint: '任何 OpenAI 兼容端点：OpenRouter、DeepSeek、Together、本地 Ollama/LM Studio… 第三方填它们的地址。注意官方 api.openai.com 默认不放行浏览器跨域。',
  },
}

// BYOK 门：选 provider、粘自己的 key（可自定义 base URL 接第三方），存进 IndexedDB，前端直连。
// 你（产品）从头到尾不碰任何人的 key。
export function KeyGate() {
  const setSettings = useStore((s) => s.setSettings)
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [teacherModel, setTeacherModel] = useState(DEFAULTS.anthropic.teacher)
  const [observerModel, setObserverModel] = useState(DEFAULTS.anthropic.observer)
  const [testing, setTesting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  function switchProvider(p: Provider) {
    setProvider(p)
    setTeacherModel(DEFAULTS[p].teacher)
    setObserverModel(DEFAULTS[p].observer)
    setErr(null)
    setOk(false)
  }

  function current(): Parameters<typeof setSettings>[0] {
    return {
      provider,
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim(),
      teacherModel: teacherModel.trim(),
      observerModel: observerModel.trim(),
    }
  }

  async function check() {
    setTesting(true)
    setErr(null)
    setOk(false)
    const e = await testKey(current())
    setTesting(false)
    if (e) setErr(e)
    else setOk(true)
  }

  async function enter() {
    await setSettings(current())
  }

  return (
    <div className="gate">
      <h1>Cairn</h1>
      <p className="tag">
        显化你和 AI 学习时的探索过程本身，并在该收的时候帮你收。
        <br />
        纯前端、本地优先：你的 key 和你的图都只存在这台机器上，从不上传。
      </p>

      <label>接口形态</label>
      <div className="row" style={{ marginTop: 0, gap: 8 }}>
        <button
          className={`btn ${provider === 'anthropic' ? '' : 'ghost'}`}
          onClick={() => switchProvider('anthropic')}
        >
          Anthropic
        </button>
        <button
          className={`btn ${provider === 'openai' ? '' : 'ghost'}`}
          onClick={() => switchProvider('openai')}
        >
          OpenAI 兼容
        </button>
      </div>
      <p className="note">{DEFAULTS[provider].hint}</p>

      <label>Base URL（第三方 / 代理 / 本地填这里；留空走官方）</label>
      <input
        value={baseURL}
        onChange={(e) => setBaseURL(e.target.value)}
        placeholder={DEFAULTS[provider].base}
        autoComplete="off"
      />
      <div className="row" style={{ marginTop: 6, gap: 8 }}>
        <button
          type="button"
          className="btn ghost"
          onClick={() =>
            setBaseURL(
              provider === 'anthropic'
                ? `${location.origin}/api/anthropic`
                : `${location.origin}/api/openai/v1`,
            )
          }
        >
          用本站代理（解决官方 CORS）
        </button>
      </div>
      <p className="note">
        官方 api.openai.com 不放行浏览器跨域。部署到 Cloudflare Pages 后，点此把请求改走同源代理（/api/…），即可直连官方端点；第三方 / 兼容端点无需代理。本地 dev 无此代理。
      </p>

      <label>API Key（BYOK）</label>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
        autoComplete="off"
      />
      <p className="note">存进浏览器 IndexedDB，直连，我们不碰它。换机器要重新填。</p>

      <label>老师模型</label>
      <input value={teacherModel} onChange={(e) => setTeacherModel(e.target.value)} />
      <label>观察者模型</label>
      <input value={observerModel} onChange={(e) => setObserverModel(e.target.value)} />
      <p className="note">
        ⚠️ 模型名按你的 provider 实际可用 ID 填。观察者是判断引擎，预算够可换更强的模型。
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
