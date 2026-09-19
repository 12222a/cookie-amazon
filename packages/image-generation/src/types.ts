export type GenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export type GenerationCreateParams = {
  prompt: string
  negativePrompt?: string
  provider?: string
  model?: string
  aspectRatio?: string
  quality?: string
  count?: number
  referenceImages?: string[]
}

export type GenerationCreateResult = {
  provider: string
  providerJobId: string
  status: GenerationStatus
  images?: string[]
  error?: string
}

export type ImageGenerationProvider = {
  readonly name: string
  create(params: GenerationCreateParams): Promise<GenerationCreateResult>
}

export type ProviderConfig = {
  baseUrl: string
  apiKey: string
  model?: string
  fetch?: typeof globalThis.fetch
}