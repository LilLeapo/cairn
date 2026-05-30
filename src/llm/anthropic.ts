import Anthropic from '@anthropic-ai/sdk'
import {
  TEACHER_SYSTEM,
  OBSERVER_SYSTEM,
  UPDATE_MAP_NAME,
  UPDATE_MAP_DESCRIPTION,
  UPDATE_MAP_SCHEMA,
} from '../prompts'
import {
  pathLine,
  observerUserContent,
  type LLMProvider,
  type ObserverResult,
} from './shared'

// 浏览器直连。dangerouslyAllowBrowser 在 BYOK 模式下是正当用法（用户自己的 key）。
// baseURL 留空走官方 api.anthropic.com；填了就走第三方 / 代理 / 兼容端点。
function client(apiKey: string, baseURL: string) {
  return new Anthropic({
    apiKey,
    baseURL: baseURL || undefined,
    dangerouslyAllowBrowser: true,
  })
}

const TOOL = {
  name: UPDATE_MAP_NAME,
  description: UPDATE_MAP_DESCRIPTION,
  input_schema: UPDATE_MAP_SCHEMA,
} as unknown as Anthropic.Tool

export const anthropicProvider: LLMProvider = {
  async streamTeacher(p) {
    const c = client(p.apiKey, p.baseURL)
    const system = `${TEACHER_SYSTEM}\n\n# 当前位置\n用户所在路径：${pathLine(p.path)}。`
    const messages = [
      ...p.history.map((m) => ({
        role: (m.role === 'teacher' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content,
      })),
      { role: 'user' as const, content: p.userText },
    ]

    let full = ''
    // max_tokens 给足：若端点默认开了 thinking，思考也吃这份额度，太小会被截断。
    const stream = c.messages.stream({ model: p.model, max_tokens: 4096, system, messages })
    stream.on('text', (t) => {
      full += t
      p.onDelta(t)
    })
    await stream.finalMessage()
    return full
  },

  async runObserver(p): Promise<ObserverResult | null> {
    const c = client(p.apiKey, p.baseURL)
    // tool_choice 用 auto，不强制具体工具：开了 thinking 的模型不支持强制 tool_choice
    // （会报 400 Thinking mode does not support this tool_choice）。靠 prompt 里
    // "只调用 update_map" 的硬指令来保证它仍然会调。max_tokens 给足以容纳 thinking。
    const resp = await c.messages.create({
      model: p.model,
      max_tokens: 4096,
      system: OBSERVER_SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: observerUserContent(p) }],
    })
    const block = resp.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return null
    return block.input as ObserverResult
  },

  async testKey(apiKey, baseURL, model) {
    try {
      const c = client(apiKey, baseURL)
      await c.messages.create({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  },
}
