import { describe, expect, it } from 'vitest'
import { handleFashionApi, isFashionApiPath, type FashionEnv } from '../fashion-api'

const emptyDb = {
  prepare: () => ({
    all: async () => ({ results: [], success: true, meta: {} }),
  }),
} as unknown as D1Database

describe('fashion worker api', () => {
  it('recognizes all stable fashion business routes', () => {
    expect(isFashionApiPath('/api/references')).toBe(true)
    expect(isFashionApiPath('/api/references/reference-1/image')).toBe(true)
    expect(isFashionApiPath('/api/generations')).toBe(true)
    expect(isFashionApiPath('/api/generation-jobs')).toBe(true)
    expect(isFashionApiPath('/api/candidates')).toBe(true)
    expect(isFashionApiPath('/api/candidates/candidate-1/image')).toBe(true)
    expect(isFashionApiPath('/api/candidates/candidate-1/reviews')).toBe(false)
    expect(isFashionApiPath('/api/extension/config')).toBe(false)
  })

  it('lists references through the stable API contract', async () => {
    const response = await handleFashionApi(
      new Request('https://example.com/api/references'),
      { FASHION_DB: emptyDb },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ references: [] })
  })

  it('fails uploads cleanly when image storage is unavailable', async () => {
    const response = await handleFashionApi(
      new Request('https://example.com/api/references', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: 'dress.png', dataUrl: 'data:image/png;base64,YQ==' }),
      }),
      { FASHION_DB: emptyDb } as FashionEnv,
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'failed', error: '图片存储暂时不可用' })
  })

  it('allows deleting a shared reference without an administrator actor', async () => {
    const deletedKeys: string[] = []
    const reference = {
      id: 'reference-1', title: '蓝色连衣裙', category: '女士裙装', uploaded_by: '普通成员',
      uploaded_at: '2026-01-01T00:00:00.000Z', used_count: 0, last_used_at: null,
      object_key: 'references/reference-1.png', mime_type: 'image/png',
    }
    const db = {
      prepare: (query: string) => ({
        bind: () => ({
          first: async () => query.includes('FROM fashion_references') ? reference : null,
          run: async () => ({ success: true, meta: { changes: 1 } }),
        }),
      }),
    } as unknown as D1Database
    const images = {
      delete: async (key: string) => { deletedKeys.push(key) },
    } as unknown as R2Bucket

    const response = await handleFashionApi(
      new Request('https://example.com/api/references/reference-1', { method: 'DELETE' }),
      { FASHION_DB: db, FASHION_IMAGES: images },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: true, referenceId: 'reference-1' })
    expect(deletedKeys).toEqual(['references/reference-1.png'])
  })

  it('keeps scheduled generation disabled until a schedule is configured', async () => {
    const response = await handleFashionApi(
      new Request('https://example.com/api/daily/run', { method: 'POST' }),
      { FASHION_DB: emptyDb },
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'disabled', error: '每日自动生成尚未启用' })
  })
})