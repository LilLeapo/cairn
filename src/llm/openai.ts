import OpenAI from 'openai'
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

// OpenAI 兼容形态。baseURL 留空走官方 api.openai.com/v1；填了就走第三方：
// OpenRouter、DeepSeek、Together、本地 Ollama/LM Studio… 都是 OpenAI 兼容协议。
// 注意：官方 api.openai.com 默认不放行浏览器跨域(CORS)，要直连请用支持 CORS 的端点。
function client(apiKey: string, baseURL: string) {
  return new OpenAI({
    apiKey,
    baseURL: baseURL || undefined,
    dangerouslyAllowBrowser: true,
  })
}

const TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: UPDATE_MAP_NAME,
    description: UPDATE_MAP_DESCRIPTION,
    parameters: UPDATE_MAP_SCHEMA as unknown as Record<string, unknown>,
  },
}

export const openaiProvider: LLMProvider = {
  async streamTeacher(p) {
    const c = client(p.apiKey, p.baseURL)
    const system = `${TEACHER_SYSTEM}\n\n# 当前位置\n用户所在路径：${pathLine(p.path)}。`
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      ...p.history.map((m) => ({
        role: (m.role === 'teacher' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content,
      })),
      { role: 'user', content: p.userText },
    ]

    let full = ''
    const stream = await c.chat.completions.create({
      model: p.model,
      max_tokens: 2048,
      stream: true,
      messages,
    })
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        full += delta
        p.onDelta(delta)
      }
    }
    return full
  },

  async runObserver(p): Promise<ObserverResult | null> {
    const c = client(p.apiKey, p.baseURL)
    const resp = await c.chat.completions.create({
      model: p.model,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: OBSERVER_SYSTEM },
        { role: 'user', content: observerUserContent(p) },
      ],
      tools: [TOOL],
      tool_choice: { type: 'function', function: { name: UPDATE_MAP_NAME } },
    })
    const call = resp.choices[0]?.message?.tool_calls?.[0]
    if (!call || call.type !== 'function') return null
    try {
      return JSON.parse(call.function.arguments) as ObserverResult
    } catch {
      return null
    }
  },

  async testKey(apiKey, baseURL, model) {
    try {
      const c = client(apiKey, baseURL)
      await c.chat.completions.create({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      })
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  },
}
