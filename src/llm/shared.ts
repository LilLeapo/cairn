import type { Message } from '../types'

// 两套循环在 provider 之间共享的契约。Anthropic 和 OpenAI 各实现一份。

export interface PathStep {
  title: string
  summary: string | null
}

export function pathLine(path: PathStep[]): string {
  if (path.length === 0) return '根层'
  return path
    .map((s) => (s.summary ? `${s.title}（已收拢：${s.summary}）` : s.title))
    .join(' → ')
}

export interface TeacherParams {
  apiKey: string
  baseURL: string
  model: string
  path: PathStep[]
  history: Message[]
  userText: string
  onDelta: (chunk: string) => void
}

export interface ObserverParams {
  apiKey: string
  baseURL: string
  model: string
  path: PathStep[]
  childrenTitles: string[]
  history: Message[]
}

// 观察者的结构化输出。两种 API 都映射到这同一个形状。
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

export interface LLMProvider {
  streamTeacher(p: TeacherParams): Promise<string>
  runObserver(p: ObserverParams): Promise<ObserverResult | null>
  testKey(apiKey: string, baseURL: string, model: string): Promise<string | null>
}

// 观察者要喂给老师/观察者的用户侧上下文，两 provider 共用一份拼装逻辑。
export function observerUserContent(p: ObserverParams): string {
  const transcript = p.history
    .map((m) => `${m.role === 'teacher' ? '老师' : '用户'}：${m.content}`)
    .join('\n\n')
  return `# 当前层路径
${pathLine(p.path)}

# 这一层已经有的子节点
${p.childrenTitles.length ? p.childrenTitles.join('、') : '（还没有）'}

# 这一层到目前为止的对话
${transcript}

现在解读这一层，调用 update_map。`
}
