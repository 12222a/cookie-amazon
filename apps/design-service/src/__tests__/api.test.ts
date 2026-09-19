import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createDesignApi } from '../api'
import type { GenerationService } from '../generation-service'
import { createLocalSharedReferenceRepository, type SharedFashionReference, type SharedReferenceRepository } from '../reference-repository'

const service = (generate: GenerationService['generate']): GenerationService => ({ generate })
const sharedReference: SharedFashionReference = {
  id: 'ref-1', title: '蓝色连衣裙', category: '女士裙装', uploadedBy: '内部成员', uploadedAt: '2026-01-01T00:00:00.000Z',
  usedCount: 0, imageUrl: '/api/references/ref-1/image',
}
const repository = (overrides: Partial<SharedReferenceRepository> = {}): SharedReferenceRepository => ({
  enabled: true,
  list: vi.fn(async () => [sharedReference]),
  create: vi.fn(async () => sharedReference),
  getImage: vi.fn(async () => new Response('image', { headers: { 'content-type': 'image/png' } })),
  getDataUrl: vi.fn(async () => 'data:image/png;base64,aA=='),
  selectForDaily: vi.fn(async () => [sharedReference]),
  markUsed: vi.fn(async () => undefined),
  ...overrides,
})
const config = { allowedOrigin: 'http://localhost:5173' }

describe('design service API', () => {
  it('reports health and shared-library availability', async () => {
    const api = createDesignApi(service(vi.fn()), repository(), config)
    const response = await api(new Request('http://localhost/api/health'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, sharedLibrary: true })
  })

  it('lists and uploads company-shared references', async () => {
    const references = repository()
    const api = createDesignApi(service(vi.fn()), references, config)
    const listed = await api(new Request('http://localhost/api/references'))
    await expect(listed.json()).resolves.toEqual({ references: [sharedReference] })

    const uploaded = await api(new Request('http://localhost/api/references', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: 'dress.png', dataUrl: 'data:image/png;base64,aA==' }),
    }))
    expect(uploaded.status).toBe(201)
    expect(references.create).toHaveBeenCalledWith({ filename: 'dress.png', dataUrl: 'data:image/png;base64,aA==' })
  })

  it('creates a generation without accepting browser prompts or provider settings', async () => {
    const generate = vi.fn(async () => ({
      provider: 'litellm', providerJobId: 'job-1', status: 'succeeded' as const,
      images: ['https://images.example/1.png'], composedPrompt: 'AI composed dress prompt',
    }))
    const api = createDesignApi(service(generate), repository(), config)
    const response = await api(new Request('http://localhost/api/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify({
        referenceImages: ['data:image/png;base64,aA=='],
        prompt: 'browser prompt must be ignored', provider: 'openai', count: 4,
      }),
    }))
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(generate).toHaveBeenCalledWith({ referenceImages: ['data:image/png;base64,aA=='] })
  })

  it('automatically picks and marks a shared reference when none is selected', async () => {
    const references = repository()
    const generate = vi.fn(async () => ({ provider: 'litellm', providerJobId: 'job-auto', status: 'succeeded' as const, images: [], composedPrompt: 'daily dress design' }))
    const api = createDesignApi(service(generate), references, config)
    const response = await api(new Request('http://localhost/api/generations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ autoSelectReferences: true }),
    }))
    expect(response.status).toBe(200)
    expect(references.selectForDaily).toHaveBeenCalledWith(1)
    expect(generate).toHaveBeenCalledWith({
      referenceImages: ['data:image/png;base64,aA=='],
      references: [{ referenceId: 'ref-1', selectionMode: 'automatic' }],
    })
    expect(references.markUsed).toHaveBeenCalledWith(sharedReference)
  })

  it('persists uploaded references across repository instances for other sessions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cookie-amazon-references-'))
    try {
      const firstSession = createLocalSharedReferenceRepository(directory)
      const created = await firstSession.create({ filename: 'dress.png', dataUrl: 'data:image/png;base64,aW1hZ2U=', uploadedBy: '设计组' })
      const secondSession = createLocalSharedReferenceRepository(directory)
      await expect(secondSession.list()).resolves.toEqual([created])
      await expect(secondSession.getDataUrl(created.id)).resolves.toBe('data:image/png;base64,aW1hZ2U=')
      const [selected] = await secondSession.selectForDaily(1)
      await secondSession.markUsed(selected)
      await expect(createLocalSharedReferenceRepository(directory).list()).resolves.toMatchObject([{ id: created.id, usedCount: 1 }])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects oversized daily batches', async () => {
    const api = createDesignApi(service(vi.fn()), repository(), config)
    const response = await api(new Request('http://localhost/api/daily/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobs: Array(21).fill({ referenceImages: ['data:image/png;base64,aA=='] }) }),
    }))
    expect(response.status).toBe(400)
  })
})