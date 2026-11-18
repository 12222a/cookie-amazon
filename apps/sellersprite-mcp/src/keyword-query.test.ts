import type { SellerSpriteKeywordReverseInput, SellerSpriteKeywordReverseRequest } from '@cookie-amazon/protocol'
import { describe, expect, it, vi } from 'vitest'
import { createKeywordQuery } from './keyword-query.js'

type Job = { requestId: string; request: SellerSpriteKeywordReverseRequest }
const input: SellerSpriteKeywordReverseInput = {
  asin: 'B0F9XY6HXB', marketId: 1, month: '', forceReStat: false, badges: [], limit: 50,
}
const success = ({ requestId, request }: Job) => ({
  namespace: request.namespace, protocolVersion: request.protocolVersion, kind: 'response',
  requestId, action: request.action, ok: true, data: { asin: request.payload.input.asin, total: 0, items: [] },
})

describe('shared keyword queries', () => {
  it('reuses completed queries for two minutes without extending expiry on reads', async () => {
    let now = 0
    const enqueue = vi.fn(async (job: Job) => success(job))
    const query = createKeywordQuery(enqueue, 'sellersprite', () => now)
    expect((await query(input)).cache).toEqual({ hit: false, expiresAt: '1970-01-01T00:02:00.000Z' })
    now = 119_999
    expect((await query(input)).cache.hit).toBe(true)
    expect(enqueue).toHaveBeenCalledTimes(1)
    now = 120_000
    expect((await query(input)).cache.hit).toBe(false)
    expect(enqueue).toHaveBeenCalledTimes(2)
  })

  it('merges concurrent identical queries into one upstream request', async () => {
    let complete!: () => void
    const enqueue = vi.fn((job: Job) => new Promise<unknown>((resolve) => { complete = () => resolve(success(job)) }))
    const query = createKeywordQuery(enqueue, 'sellersprite')
    const first = query(input)
    const second = query(input)
    expect(enqueue).toHaveBeenCalledTimes(1)
    complete()
    const results = await Promise.all([first, second])
    expect(results[0].response).toEqual(results[1].response)
    expect(results.map((result) => result.cache.hit)).toEqual([false, true])
  })

  it.each<Partial<SellerSpriteKeywordReverseInput>>([
    { asin: 'B0F9WB31QN' }, { marketId: 3 }, { month: '2026-10' }, { badges: ['ADS'] }, { limit: 20 },
  ])('does not mix queries with different parameters: %j', async (changed) => {
    const enqueue = vi.fn(async (job: Job) => success(job))
    const query = createKeywordQuery(enqueue, 'sellersprite')
    await query(input)
    expect((await query({ ...input, ...changed })).cache.hit).toBe(false)
    expect(enqueue).toHaveBeenCalledTimes(2)
  })

  it('always refreshes when requested and shares the newly fetched result afterward', async () => {
    const enqueue = vi.fn(async (job: Job) => success(job))
    const query = createKeywordQuery(enqueue, 'sellersprite')
    await query(input)
    expect((await query(input, true)).cache.hit).toBe(false)
    expect((await query({ ...input, forceReStat: true })).cache.hit).toBe(false)
    expect((await query({ ...input, forceReStat: true })).cache.hit).toBe(false)
    expect((await query(input)).cache.hit).toBe(true)
    expect(enqueue).toHaveBeenCalledTimes(4)
    expect(enqueue.mock.calls[3][0].request.payload.input.forceReStat).toBe(true)
  })

  it('bounds the cache to eight query keys', async () => {
    const enqueue = vi.fn(async (job: Job) => success(job))
    const query = createKeywordQuery(enqueue, 'sellersprite')
    for (let limit = 1; limit <= 9; limit++) await query({ ...input, limit })
    expect((await query({ ...input, limit: 2 })).cache.hit).toBe(true)
    expect((await query({ ...input, limit: 1 })).cache.hit).toBe(false)
    expect(enqueue).toHaveBeenCalledTimes(10)
  })

  it.each(['error', 'invalid', 'rejected'])('does not cache %s responses', async (kind) => {
    const enqueue = vi.fn(async (job: Job) => {
      if (kind === 'rejected') throw new Error('BRIDGE_TIMEOUT')
      if (kind === 'invalid') return { ...success(job), requestId: 'wrong' }
      return { ...success(job), ok: false, error: { code: 'TARGET_NOT_LOGGED_IN' } }
    })
    const query = createKeywordQuery(enqueue, 'sellersprite')
    for (let attempt = 0; attempt < 2; attempt++) {
      if (kind === 'error') expect((await query(input)).response.ok).toBe(false)
      else await expect(query(input)).rejects.toThrow(kind === 'invalid' ? 'INVALID_EXTENSION_RESPONSE' : 'BRIDGE_TIMEOUT')
    }
    expect(enqueue).toHaveBeenCalledTimes(2)
  })

  it('keeps a refresh result when an older request completes afterward', async () => {
    const pending: Array<{ job: Job; resolve: (value: unknown) => void }> = []
    const query = createKeywordQuery((job) => new Promise((resolve) => { pending.push({ job, resolve }) }), 'sellersprite')
    const older = query(input)
    const newer = query(input, true)
    pending[1].resolve(success(pending[1].job))
    const fresh = await newer
    pending[0].resolve(success(pending[0].job))
    await older
    expect((await query(input)).response.requestId).toBe(fresh.response.requestId)
  })
})
