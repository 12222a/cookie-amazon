import type { GenerationCreateParams } from './types'

export const MAX_REFERENCE_IMAGES = 4
export const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

const DATA_URL = /^data:([^;,]+);base64,([\s\S]+)$/i

const decodedSize = (base64: string): number => {
  const normalized = base64.replace(/\s+/g, '')
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0
  return Math.floor(normalized.length * 3 / 4) - padding
}

const isPrivateHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/[\[\]]/g, '')
  if (host === 'localhost' || host === '::1' || host.endsWith('.localhost')) return true
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false
  const [first, second] = parts
  return first === 0 || first === 10 || first === 127 || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
}

export const validateReferenceImage = (value: string): string => {
  const image = value.trim()
  const dataMatch = DATA_URL.exec(image)
  if (dataMatch) {
    const mimeType = dataMatch[1].toLowerCase()
    if (!SUPPORTED_IMAGE_TYPES.includes(mimeType as typeof SUPPORTED_IMAGE_TYPES[number])) {
      throw new Error(`不支持的参考图格式：${mimeType}`)
    }
    if (decodedSize(dataMatch[2]) > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error('参考图不能超过 10MB')
    }
    return image
  }

  let url: URL
  try { url = new URL(image) } catch { throw new Error('参考图必须是有效图片 data URL 或 HTTP(S) 地址') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('参考图地址仅支持 HTTP(S)')
  if (isPrivateHost(url.hostname)) throw new Error('参考图地址不能指向本机或私有网络')
  return url.toString()
}

export const normalizeGenerationParams = (params: GenerationCreateParams): GenerationCreateParams => {
  const prompt = params.prompt.trim()
  if (!prompt) throw new Error('生成提示词不能为空')
  const rawReferenceImages = params.referenceImages ?? []
  if (rawReferenceImages.length > MAX_REFERENCE_IMAGES) throw new Error('最多支持 4 张参考图')
  const referenceImages = [...new Set(rawReferenceImages)].map(validateReferenceImage)
  const count = Math.max(1, Math.min(4, Math.floor(params.count ?? 1)))
  return { ...params, prompt, count, referenceImages }
}

export const imageInputToBlob = async (value: string, fetcher: typeof fetch = fetch): Promise<Blob> => {
  const dataMatch = DATA_URL.exec(value)
  if (dataMatch) {
    const bytes = Uint8Array.from(atob(dataMatch[2].replace(/\s+/g, '')), (character) => character.charCodeAt(0))
    return new Blob([bytes], { type: dataMatch[1].toLowerCase() })
  }
  const response = await fetcher(value)
  if (!response.ok) throw new Error(`读取参考图失败：HTTP ${response.status}`)
  const blob = await response.blob()
  if (!SUPPORTED_IMAGE_TYPES.includes(blob.type as typeof SUPPORTED_IMAGE_TYPES[number])) {
    throw new Error(`不支持的远程参考图格式：${blob.type || 'unknown'}`)
  }
  if (blob.size > MAX_REFERENCE_IMAGE_BYTES) throw new Error('参考图不能超过 10MB')
  return blob
}