import Anthropic from '@anthropic-ai/sdk'
import { TEACHER_SYSTEM, OBSERVER_SYSTEM, UPDATE_MAP_TOOL } from './prompts'
import type { Message } from './types'

// 浏览器直连 api.anthropic.com —— BYOK：用户自己的 key，前端直接拿来调，从不经过任何服务器。
// dangerouslyAllowBrowser 在这里是正当用法（自带 key 模式），不是反模式。
// 反模式只有一种：把 key 写死进代码再公开页面。我们不做那件事。
function client(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

export interface PathStep {
  title: string
  summary: string | null
}

function pathLine(path: PathStep[]): string {
  if (path.length === 0) return '根层'
  return path
    .map((s) => (s.summary ? `${s.title}（已收拢：${s.summary}）` : s.title))
    .join(' → ')
}

// ── 老师循环：流式回答。
export async function streamTeacher(opts: {
  apiKey: string
  model: string
  path: PathStep[]
  history: Message[]
  userText: string
  onDelta: (chunk: string) => void
}): Promise<string> {
  const c = client(opts.apiKey)
  const system = `${TEACHER_SYSTEM}\n\n# 当前位置\n用户所在路径：${pathLine(opts.path)}。`
  const messages = [
    ...opts.history.map((m) => ({
      role: (m.role === 'teacher' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.content,
    })),
    { role: 'user' as const, content: opts.userText },
  ]

  let full = ''
  const stream = c.messages.stream({
    model: opts.model,
    max_tokens: 2048,
    system,
    messages,
  })
  stream.on('text', (t) => {
    full += t
    opts.onDelta(t)
  })
  await stream.finalMessage()
  return full
}

// ── 观察者循环：看完这一层对话，结构化产出地图解读 + 该不该收的信号。
export interface ObserverResult {
  nodes: { title: string; status: 'empty' | 'explored'; rationale?: string }[]
  crossLinks: { from: string; to: string; label: string }[]
  directions: {
    title: string
    rationale: string
    depth: 'subgraph' | 'inline'
    loadBearing: boolean
  }[]
  collapse: { should: boolean; reason: string; question: string }
}

export async function runObserver(opts: {
  apiKey: string
  model: string
  path: PathStep[]
  childrenTitles: string[]
  history: Message[]
}): Promise<ObserverResult | null> {
  const c = client(opts.apiKey)
  const transcript = opts.history
    .map((m) => `${m.role === 'teacher' ? '老师' : '用户'}：${m.content}`)
    .join('\n\n')

  const userContent = `# 当前层路径
${pathLine(opts.path)}

# 这一层已经有的子节点
${opts.childrenTitles.length ? opts.childrenTitles.join('、') : '（还没有）'}

# 这一层到目前为止的对话
${transcript}

现在解读这一层，调用 update_map。`

  const resp = await c.messages.create({
    model: opts.model,
    max_tokens: 2048,
    system: OBSERVER_SYSTEM,
    tools: [UPDATE_MAP_TOOL as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'update_map' },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = resp.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') return null
  return block.input as ObserverResult
}

// 轻量连接测试，给 BYOK 输入框用。成功返回 null，失败返回错误信息。
export async function testKey(apiKey: string, model: string): Promise<string | null> {
  try {
    const c = client(apiKey)
    await c.messages.create({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
