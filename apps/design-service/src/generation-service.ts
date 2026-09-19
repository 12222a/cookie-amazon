import type { GenerationCreateResult, ProviderRegistry } from '@cookie-amazon/image-generation'
import type { DesignCandidate, DesignCollaborationRepository, GenerationReferenceLink, GenerationSource } from './collaboration-repository'
import type { DirectusClient } from './directus-client'
import type { PromptComposer } from './multimodal-prompt'

export type DesignGenerationRequest = {
  referenceImages: string[]
  references?: GenerationReferenceLink[]
  requestedBy?: string
  source?: GenerationSource
  retryOfJobId?: string
}

export type DesignGenerationResult = GenerationCreateResult & {
  composedPrompt: string
  jobId?: string
  candidates?: DesignCandidate[]
  persistenceWarning?: string
}

export type GenerationService = {
  generate(params: DesignGenerationRequest): Promise<DesignGenerationResult>
}

export type GenerationServiceConfig = {
  provider?: string
  aspectRatio?: string
  quality?: string
  count?: number
}

export const createGenerationService = (
  registry: ProviderRegistry,
  _directus: DirectusClient,
  promptComposer: PromptComposer,
  config: GenerationServiceConfig = {},
  collaboration?: DesignCollaborationRepository,
): GenerationService => ({
  async generate(params) {
    let jobId: string | undefined
    let persistenceWarning: string | undefined
    let candidates: DesignCandidate[] | undefined
    const provider = config.provider?.trim() || 'litellm'
    const startedAt = new Date().toISOString()

    if (collaboration?.enabled) {
      try {
        const job = await collaboration.createJob({
          source: params.source ?? 'manual',
          requestedBy: params.requestedBy,
          retryOfJobId: params.retryOfJobId,
          references: params.references,
        })
        jobId = job.id
        await collaboration.updateJob(job.id, { status: 'analyzing', startedAt })
      } catch (error) {
        persistenceWarning = error instanceof Error ? error.message : '生成任务记录创建失败'
      }
    }

    try {
      const composition = await promptComposer.compose({ referenceImages: params.referenceImages })
      if (jobId && collaboration) {
        try {
          await collaboration.updateJob(jobId, { status: 'generating', prompt: composition.prompt })
        } catch (error) {
          persistenceWarning = error instanceof Error ? error.message : '设计说明记录失败'
        }
      }

      const result = await registry.resolve(provider).create({
        prompt: composition.prompt,
        negativePrompt: composition.negativePrompt,
        provider,
        aspectRatio: config.aspectRatio || '2:3',
        quality: config.quality || 'medium',
        count: Math.max(1, Math.min(4, Math.floor(config.count ?? 2))),
        referenceImages: params.referenceImages,
      })
      if (jobId && collaboration) {
        try {
          candidates = await collaboration.createCandidates(jobId, result.images ?? [])
          const finished = result.status === 'succeeded' || result.status === 'failed'
          await collaboration.updateJob(jobId, {
            status: result.status === 'succeeded' ? 'succeeded' : result.status === 'failed' ? 'failed' : 'generating',
            providerJobId: result.providerJobId,
            ...(finished ? { finishedAt: new Date().toISOString() } : {}),
            ...(result.error ? { error: result.error } : {}),
          })
        } catch (error) {
          persistenceWarning = error instanceof Error ? error.message : '候选设计记录失败'
        }
      }
      return {
        ...result,
        composedPrompt: composition.prompt,
        ...(jobId ? { jobId } : {}),
        ...(candidates ? { candidates } : {}),
        ...(persistenceWarning ? { persistenceWarning } : {}),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片生成失败'
      if (jobId && collaboration) {
        try {
          await collaboration.updateJob(jobId, {
            status: 'failed', error: message, finishedAt: new Date().toISOString(),
          })
        } catch { /* 保留原始生成错误 */ }
      }
      throw error
    }
  },
})