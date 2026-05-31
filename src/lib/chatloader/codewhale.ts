import type { ChatParser } from './types'

/**
 * CodeWhale 导出格式解析器。
 *
 * 格式特征：
 *   **You:**       → 用户消息开始
 *   **Assistant:** → 助手回复开始
 *   *Thinking:*    → 内部思考（跳过）
 *   *System:*      → 系统消息（跳过）
 *   <turn_meta>    → 元数据块（跳过）
 *   ---            → 块分隔
 */
export const codewhaleParser: ChatParser = {
  parse(markdown) {
    const turns: { role: 'user' | 'teacher'; content: string }[] = []
    const lines = markdown.split('\n')

    type State =
      | 'idle'
      | 'in_user'
      | 'in_assistant'
      | 'in_thinking'
      | 'in_turn_meta'
      | 'in_system'

    let state: State = 'idle'
    let buf: string[] = []

    const flush = () => {
      const content = buf.join('\n').trim()
      buf = []
      const cleaned = content
        .replace(/^<turn_meta>[\s\S]*?<\/turn_meta>\n?/gm, '')
        .replace(/\n?---\n?$/, '')
        .trim()

      if (!cleaned) return

      if (state === 'in_user') {
        turns.push({ role: 'user', content: cleaned })
      } else if (state === 'in_assistant') {
        turns.push({ role: 'teacher', content: cleaned })
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      if (trimmed.startsWith('**You:**')) {
        flush()
        state = 'in_user'
        const rest = line.slice(line.indexOf('**You:**') + 8).trim()
        if (rest) buf.push(rest)
        continue
      }

      if (trimmed.startsWith('**Assistant:**')) {
        flush()
        state = 'in_assistant'
        const rest = line.slice(line.indexOf('**Assistant:**') + 14).trim()
        if (rest) buf.push(rest)
        continue
      }

      if (trimmed.startsWith('*Thinking:*')) {
        flush()
        state = 'in_thinking'
        continue
      }

      if (trimmed.startsWith('*System:*')) {
        flush()
        state = 'in_system'
        continue
      }

      if (trimmed === '<turn_meta>') {
        flush()
        state = 'in_turn_meta'
        continue
      }

      if (state === 'in_turn_meta') {
        if (trimmed === '</turn_meta>') state = 'idle'
        continue
      }

      if (state === 'in_thinking' || state === 'in_system') {
        if (trimmed === '---') state = 'idle'
        continue
      }

      if (state === 'in_user' || state === 'in_assistant') {
        if (trimmed === '---') {
          flush()
          state = 'idle'
          continue
        }
        buf.push(line)
      }
    }

    if (state === 'in_user' || state === 'in_assistant') {
      flush()
    }

    return turns
  },
}
