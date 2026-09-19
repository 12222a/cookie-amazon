import { describe, expect, it, vi } from 'vitest'
import {
  buildGenerationPayload,
  deleteSharedReference,
  generateDesign,
  listSharedReferences,
  uploadSharedReferences,
} from './generation-client'

describe('shared fashion reference client', () => {
  it('uses selected company reference IDs without browser-authored settings', () => {
    const payload = buildGenerationPayload(['ref-1', 'ref-2'])
    expect(payload).toEqual({ referenceIds: ['ref-1', 'ref-2'], requestedBy: '当前成员' })
    expect(payload).not.toHaveProperty('prompt')
    expect(payload).not.toHaveProperty('provider')
    expect(payload).not.toHaveProperty('model')
  })

  it('requests automatic reference selection when no image is selected', () => {
    expect(buildGenerationPayload([])).toEqual({ autoSelectReferences: true, requestedBy: '当前成员' })
  })

  it('loads shared references and resolves service image URLs', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ references: [{
      id: 'ref-1', title: '蓝色连衣裙', category: '女士裙装', imageUrl: '/api/references/ref-1/image',
      uploadedAt: '2026-01-01T00:00:00.000Z', uploadedBy: '内部成员', usedCount: 0,
    }] }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch
    const references = await listSharedReferences(fetcher)
    expect(references[0]?.imageUrl).toBe('/api/references/ref-1/image')
  })

  it('uploads files to the company library and selects IDs for generation', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toEqual({ 'content-type': 'application/json' })
      expect(JSON.parse(String(init?.body))).toMatchObject({ filename: 'dress.png', dataUrl: 'data:image/png;base64,aW1hZ2U=' })
      return new Response(JSON.stringify({ reference: {
        id: 'ref-2', title: 'dress.png', category: '女士裙装', imageUrl: '/api/references/ref-2/image',
        uploadedAt: '2026-01-02T00:00:00.000Z', uploadedBy: '内部成员', usedCount: 0,
      } }), { status: 201, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const uploaded = await uploadSharedReferences([new File(['image'], 'dress.png', { type: 'image/png' })], { fetcher })
    expect(uploaded.map((item) => item.id)).toEqual(['ref-2'])
  })

  it('allows any member to delete a shared reference without an administrator actor', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('/api/references/ref-2')
      expect(init).toEqual({ method: 'DELETE' })
      return new Response(JSON.stringify({ deleted: true, referenceId: 'ref-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    await deleteSharedReference('ref-2', fetcher)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('sends automatic daily generation requests without local image data', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ autoSelectReferences: true, requestedBy: '当前成员' })
      return new Response(JSON.stringify({ status: 'succeeded', images: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    await generateDesign([], fetcher)
  })

})