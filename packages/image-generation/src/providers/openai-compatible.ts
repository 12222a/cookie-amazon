import { imageInputToBlob, normalizeGenerationParams } from '../image-input'
import type { GenerationCreateParams, GenerationCreateResult, ImageGenerationProvider, ProviderConfig } from '../types'

const endpoint = (baseUrl: string, action: 'generations' | 'edits'): string => {
  const base = baseUrl.replace(/\/+$/, '').replace(/\/v1\/images\/(generations|edits)$/i, '')
  return `${base.replace(/\/v1$/i, '')}/v1/images/${action}`
}

const requestedSize = (ratio?: string): string => {
  if (['9:16', '2:3', '3:4', '4:5'].includes(ratio ?? '')) return '1024x1536'
  if (['16:9', '3:2', '4:3', '5:4'].includes(ratio ?? '')) return '1536x1024'
  return '1024x1024'
}

const requestedQuality = (quality?: string): string => {
  const normalized = quality?.toLowerCase()
  if (normalized === 'high' || normalized === '2k' || normalized === '4k') return 'high'
  if (normalized === 'low') return 'low'
  return 'medium'
}

const responseMessage = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => '')
  if (!text) return response.statusText || '图片服务返回空错误'
  try {
    const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
    return typeof json.error === 'string' ? json.error : json.error?.message ?? json.message ?? text.slice(0, 800)
  } catch { return text.slice(0, 800) }
}

const resultImages = (payload: unknown): string[] => {
  if (!payload || typeof payload !== 'object') return []
  const body = payload as { data?: Array<{ url?: string; b64_json?: string }>; images?: string[]; output?: string | string[] }
  const fromData = body.data?.flatMap((item) => item.url ? [item.url] : item.b64_json ? [`data:image/png;base64,${item.b64_json}`] : []) ?? []
  if (fromData.length) return fromData
  if (Array.isArray(body.images)) return body.images.filter((image): image is string => typeof image === 'string')
  if (Array.isArray(body.output)) return body.output.filter((image): image is string => typeof image === 'string')
  return typeof body.output === 'string' ? [body.output] : []
}

const createId = (): string => globalThis.crypto?.randomUUID?.() ?? `generation_${Date.now()}`

export const createOpenAICompatibleProvider = (config: ProviderConfig, name = 'openai-compatible'): ImageGenerationProvider => {
  if (!config.baseUrl) throw new Error('缺少 IMAGE_API_BASE_URL')
  if (!config.apiKey) throw new Error('缺少 IMAGE_API_KEY')
  const fetcher = config.fetch ?? fetch

  return {
    name,
    async create(input: GenerationCreateParams): Promise<GenerationCreateResult> {
      const params = normalizeGenerationParams(input)
      const model = params.model?.trim() || config.model?.trim() || 'gpt-image-1'
      const prompt = params.negativePrompt?.trim()
        ? `${params.prompt}\n\nAvoid: ${params.negativePrompt.trim()}`
        : params.prompt
      const headers = { authorization: `Bearer ${config.apiKey}` }
      let response: Response

      if (params.referenceImages?.length) {
        const form = new FormData()
        form.set('model', model)
        form.set('prompt', prompt)
        form.set('n', String(params.count))
        form.set('size', requestedSize(params.aspectRatio))
        form.set('quality', requestedQuality(params.quality))
        const blobs = await Promise.all(params.referenceImages.map((image) => imageInputToBlob(image, fetcher)))
        const field = blobs.length === 1 ? 'image' : 'image[]'
        blobs.forEach((blob, index) => form.append(field, blob, `reference-${index + 1}.${blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1]}`))
        response = await fetcher(endpoint(config.baseUrl, 'edits'), { method: 'POST', headers, body: form })
      } else {
        response = await fetcher(endpoint(config.baseUrl, 'generations'), {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ model, prompt, n: params.count, size: requestedSize(params.aspectRatio), quality: requestedQuality(params.quality) }),
        })
      }

      if (!response.ok) throw new Error(`图片生成失败（HTTP ${response.status}）：${await responseMessage(response)}`)
      const images = resultImages(await response.json())
      if (!images.length) throw new Error('图片服务响应中没有可用图片')
      return { provider: name, providerJobId: createId(), status: 'succeeded', images }
    },
  }
}