import type { Message } from '../../types'

export type ExportFormat = 'codewhale' | 'claude'

export interface ChatParser {
  parse(markdown: string): { role: 'user' | 'teacher'; content: string }[]
}

export interface CairnDb {
  putMessage(msg: Message): Promise<void>
}
