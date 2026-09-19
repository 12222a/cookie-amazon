import { createOpenAICompatibleProvider } from './providers/openai-compatible'
import type { ImageGenerationProvider, ProviderConfig } from './types'

export type ProviderRegistry = { resolve(name?: string): ImageGenerationProvider }

export const createProviderRegistry = (config: ProviderConfig): ProviderRegistry => {
  const cache = new Map<string, ImageGenerationProvider>()
  return {
    resolve(requestedName = 'litellm') {
      const name = requestedName.trim().toLowerCase()
      if (!['litellm', 'openai', 'openai-compatible'].includes(name)) {
        throw new Error(`暂不支持图片供应商：${requestedName}`)
      }
      const existing = cache.get(name)
      if (existing) return existing
      const provider = createOpenAICompatibleProvider(config, name)
      cache.set(name, provider)
      return provider
    },
  }
}