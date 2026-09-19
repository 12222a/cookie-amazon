import { describe, expect, it, vi } from 'vitest'
import type { ImageGenerationProvider, ProviderRegistry } from '@cookie-amazon/image-generation'
import { createDirectusClient } from '../directus-client'
import { createGenerationService } from '../generation-service'
import { createOpenAICompatiblePromptComposer, type PromptComposer } from '../multimodal-prompt'

describe('OpenAI-compatible multimodal prompt composer', () => {
  it('maps reference images to chat completions image_url content', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        model: string
        messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>
      }
      expect(body.model).toBe('vision-model')
      expect(body.messages[1].content).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'image_url', image_url: { url: 'data:image/png;base64,aA==' } }),
      ]))
      return new Response(JSON.stringify({ choices: [{ message: { content: '全新差异化女士连衣裙设计提示词' } }] }), { status: 200 })
    })
    const composer = createOpenAICompatiblePromptComposer({
      baseUrl: 'http://litellm:4000', apiKey: 'server-key', model: 'vision-model', fetch: fetcher as typeof fetch,
    })

    await expect(composer.compose({ referenceImages: ['data:image/png;base64,aA=='] })).resolves.toMatchObject({
      prompt: '全新差异化女士连衣裙设计提示词',
      negativePrompt: expect.stringContaining('品牌标志'),
    })
    expect(fetcher).toHaveBeenCalledWith('http://litellm:4000/v1/chat/completions', expect.any(Object))
  })

  it('rejects requests without reference images', async () => {
    const composer = createOpenAICompatiblePromptComposer({ baseUrl: 'http://litellm:4000', apiKey: 'server-key' })
    await expect(composer.compose({ referenceImages: [] })).rejects.toThrow('至少上传 1 张')
  })
})

describe('automatic generation orchestration', () => {
  it('uses the multimodal composed prompt for the image provider', async () => {
    const create = vi.fn(async () => ({
      provider: 'litellm', providerJobId: 'image-job', status: 'succeeded' as const,
      images: ['https://images.example/new-dress.png'],
    }))
    const provider: ImageGenerationProvider = { name: 'litellm', create }
    const registry: ProviderRegistry = { resolve: vi.fn(() => provider) }
    const promptComposer: PromptComposer = {
      compose: vi.fn(async () => ({ prompt: 'AI 自动生成的新款提示词', negativePrompt: 'logo, watermark' })),
    }
    const service = createGenerationService(registry, createDirectusClient({}), promptComposer)

    const result = await service.generate({ referenceImages: ['data:image/png;base64,aA=='] })

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'AI 自动生成的新款提示词',
      negativePrompt: 'logo, watermark',
      provider: 'litellm', aspectRatio: '2:3', quality: 'medium', count: 2,
      referenceImages: ['data:image/png;base64,aA=='],
    }))
    expect(result).toMatchObject({ status: 'succeeded', composedPrompt: 'AI 自动生成的新款提示词' })
  })
})