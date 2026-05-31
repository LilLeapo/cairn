import type { ChatParser } from './types'

export const claudeParser: ChatParser = {
  parse(_markdown) {
    throw new Error('Claude 导出格式解析尚未实现。有样本之后补。')
  },
}
