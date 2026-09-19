import { describe, expect, it, vi } from 'vitest'
import { normalizeGenerationParams, validateReferenceImage } from './image-input'
import { createOpenAICompatibleProvider } from './providers/openai-compatible'

describe('reference image validation', () => {
  it('accepts supported image data urls', () => {
    expect(validateReferenceImage('data:image/png;base64,aGVsbG8=')).toContain('image/png')
  })

  it('rejects excessive reference counts and private urls', () => {
    expect(() => normalizeGenerationParams({ prompt: 'dress', referenceImages: Array(5).fill('data:image/png;base64,aA==') })).toThrow('最多支持 4 张')
    expect(() => validateReferenceImage('http://127.0.0.1/private.png')).toThrow('私有网络')
  })
})

describe('OpenAI-compatible provider', () => {
  it('maps text generation requests to the OpenAI images contract', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'gpt-image-1', n: 2, size: '1024x1536' })
      return new Response(JSON.stringify({ data: [{ url: 'https://images.example/dress.png' }] }), { status: 200 })
    })
    const provider = createOpenAICompatibleProvider({ baseUrl: 'http://litellm:4000', apiKey: 'server-key', fetch: fetcher as typeof fetch }, 'litellm')
    const result = await provider.create({ prompt: 'new dress', aspectRatio: '2:3', count: 2 })
    expect(fetcher).toHaveBeenCalledWith('http://litellm:4000/v1/images/generations', expect.any(Object))
    expect(result).toMatchObject({ provider: 'litellm', status: 'succeeded', images: ['https://images.example/dress.png'] })
  })
})