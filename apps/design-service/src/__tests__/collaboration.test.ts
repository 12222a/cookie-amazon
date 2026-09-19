import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ImageGenerationProvider, ProviderRegistry } from '@cookie-amazon/image-generation'
import { createDesignApi } from '../api'
import { createLocalDesignCollaborationRepository } from '../collaboration-repository'
import { createDirectusClient } from '../directus-client'
import { createGenerationService, type GenerationService } from '../generation-service'
import type { PromptComposer } from '../multimodal-prompt'
import type { SharedReferenceRepository } from '../reference-repository'

const withRepository = async (run: (directory: string) => Promise<void>): Promise<void> => {
  const directory = await mkdtemp(join(tmpdir(), 'cookie-amazon-collaboration-'))
  try { await run(directory) } finally { await rm(directory, { recursive: true, force: true }) }
}

const referenceRepository = (): SharedReferenceRepository => ({
  enabled: true,
  list: vi.fn(async () => []),
  create: vi.fn(),
  getImage: vi.fn(),
  getDataUrl: vi.fn(),
  selectForDaily: vi.fn(),
  markUsed: vi.fn(),
})

describe('local design collaboration repository', () => {
  it('persists immutable lineage, personal favorites, reviews, and comments across sessions', async () => withRepository(async (directory) => {
    const first = createLocalDesignCollaborationRepository(directory)
    const job = await first.createJob({
      requestedBy: '设计师甲',
      references: [{ referenceId: 'ref-1', selectionMode: 'manual' }],
    })
    await first.updateJob(job.id, { status: 'succeeded', finishedAt: '2026-01-01T00:00:00.000Z' })
    const [candidate] = await first.createCandidates(job.id, ['https://images.example/candidate.png'])

    const favored = await first.setFavorite(candidate.id, '设计师甲', true)
    expect(favored).toMatchObject({ favoriteCount: 1, isFavorited: true, referenceIds: ['ref-1'] })
    await expect(first.getCandidate(candidate.id, '设计师乙')).resolves.toMatchObject({ favoriteCount: 1, isFavorited: false })

    const reviewed = await first.addReview(candidate.id, {
      decision: 'shortlist', rating: 5, reviewer: '设计主管', expectedVersion: candidate.version, reasons: ['方向清晰'],
    })
    expect(reviewed).toMatchObject({ status: 'shortlisted', version: 2, reviews: [{ reviewer: '设计主管', rating: 5 }] })
    await expect(first.addReview(candidate.id, { decision: 'reject', reviewer: '评审员', expectedVersion: 1 })).rejects.toThrow('已被其他成员更新')

    await first.addComment(candidate.id, { body: '建议补一个深色版本', author: '商品组' })
    const second = createLocalDesignCollaborationRepository(directory)
    await expect(second.getCandidate(candidate.id, '设计师甲')).resolves.toMatchObject({
      jobId: job.id, status: 'shortlisted', favoriteCount: 1, isFavorited: true,
      referenceIds: ['ref-1'], comments: [{ body: '建议补一个深色版本', author: '商品组' }],
    })
    await expect(second.listJobs()).resolves.toMatchObject([{ id: job.id, candidateCount: 1, referenceIds: ['ref-1'] }])
  }))

  it('records generated candidates through the normal generation pipeline', async () => withRepository(async (directory) => {
    const collaboration = createLocalDesignCollaborationRepository(directory)
    const create = vi.fn(async () => ({
      provider: 'litellm', providerJobId: 'provider-job', status: 'succeeded' as const,
      images: ['https://images.example/design-1.png', 'https://images.example/design-2.png'],
    }))
    const provider: ImageGenerationProvider = { name: 'litellm', create }
    const registry: ProviderRegistry = { resolve: vi.fn(() => provider) }
    const composer: PromptComposer = { compose: vi.fn(async () => ({ prompt: '差异化裙装', negativePrompt: 'logo' })) }
    const service = createGenerationService(registry, createDirectusClient({}), composer, {}, collaboration)

    const result = await service.generate({
      referenceImages: ['data:image/png;base64,aA=='],
      references: [{ referenceId: 'ref-8', selectionMode: 'automatic' }],
      requestedBy: '每日任务', source: 'scheduled',
    })

    expect(result).toMatchObject({ status: 'succeeded', jobId: expect.any(String), candidates: [
      { status: 'pending_review', referenceIds: ['ref-8'] }, { status: 'pending_review', referenceIds: ['ref-8'] },
    ] })
    await expect(collaboration.listJobs()).resolves.toMatchObject([{
      id: result.jobId, status: 'succeeded', source: 'scheduled', requestedBy: '每日任务', candidateCount: 2, referenceIds: ['ref-8'],
    }])
  }))
})

describe('candidate collaboration API', () => {
  it('exposes candidate listing, favorite, review, and comment business endpoints', async () => withRepository(async (directory) => {
    const collaboration = createLocalDesignCollaborationRepository(directory)
    const job = await collaboration.createJob({ references: [{ referenceId: 'ref-2', selectionMode: 'manual' }] })
    const [candidate] = await collaboration.createCandidates(job.id, ['https://images.example/candidate.png'])
    const generation: GenerationService = { generate: vi.fn() }
    const api = createDesignApi(generation, referenceRepository(), { allowedOrigin: 'http://localhost:5173' }, collaboration)

    const favorite = await api(new Request(`http://localhost/api/candidates/${candidate.id}/favorite`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actor: '设计师甲', favorited: true }),
    }))
    expect(favorite.status).toBe(200)

    const review = await api(new Request(`http://localhost/api/candidates/${candidate.id}/reviews`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'select', reviewer: '设计主管', expectedVersion: 1, rating: 5 }),
    }))
    expect(review.status).toBe(201)

    const comment = await api(new Request(`http://localhost/api/candidates/${candidate.id}/comments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ author: '商品组', body: '进入打样讨论' }),
    }))
    expect(comment.status).toBe(201)

    const listed = await api(new Request('http://localhost/api/candidates?status=selected&actor=%E8%AE%BE%E8%AE%A1%E5%B8%88%E7%94%B2&favorites=true'))
    expect(listed.status).toBe(200)
    await expect(listed.json()).resolves.toMatchObject({ candidates: [{
      id: candidate.id, status: 'selected', favoriteCount: 1, isFavorited: true,
      selectedBy: '设计主管', referenceIds: ['ref-2'], comments: [{ body: '进入打样讨论' }],
    }] })
  }))
})