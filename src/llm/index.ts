import type { Settings } from '../types'
import { anthropicProvider } from './anthropic'
import { openaiProvider } from './openai'
import type { PathStep, ObserverResult, LLMProvider } from './shared'
import type { Message } from '../types'

export type { PathStep, ObserverResult } from './shared'

// 一张脸，背后按 provider 分发。store 只跟这层打交道，不关心是哪家 API。
function pick(provider: Settings['provider']): LLMProvider {
  return provider === 'openai' ? openaiProvider : anthropicProvider
}

export function streamTeacher(
  settings: Settings,
  opts: { path: PathStep[]; history: Message[]; userText: string; onDelta: (c: string) => void },
): Promise<string> {
  return pick(settings.provider).streamTeacher({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
    model: settings.teacherModel,
    ...opts,
  })
}

export function runObserver(
  settings: Settings,
  opts: { path: PathStep[]; childrenTitles: string[]; history: Message[] },
): Promise<ObserverResult | null> {
  return pick(settings.provider).runObserver({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
    model: settings.observerModel,
    ...opts,
  })
}

export function testKey(settings: Settings): Promise<string | null> {
  return pick(settings.provider).testKey(settings.apiKey, settings.baseURL, settings.teacherModel)
}
