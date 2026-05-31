import type { ChatParser, ExportFormat } from './types'
import { codewhaleParser } from './codewhale'
import { claudeParser } from './claude'

export { codewhaleParser, claudeParser }
export type { ChatParser, ExportFormat }

function pick(format: ExportFormat): ChatParser {
  return format === 'claude' ? claudeParser : codewhaleParser
}

export function parseChat(format: ExportFormat, markdown: string) {
  return pick(format).parse(markdown)
}
