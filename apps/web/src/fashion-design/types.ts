export type GenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export type ReferenceAsset = {
  id: string
  title: string
  category: string
  imageUrl: string
  uploadedAt: string
  uploadedBy: string
  usedCount: number
  lastUsedAt?: string
}

export type GenerationResponse = {
  provider?: string
  providerJobId?: string
  jobId?: string
  status: GenerationStatus
  images?: string[]
  error?: string
  persistenceWarning?: string
  composedPrompt?: string
}

export type GenerationView = GenerationResponse & {
  id: string
  requestedAt: string
}