import { describe, expect, it, vi } from 'vitest'
import { requestKeywordPositionsCached } from '../panel/keyword-position-cache-client'
import { KeywordPositionCache, KEYWORD_POSITION_CACHE_STORAGE_KEY, keywordPositionCacheKey } from '../panel/keyword-position-cache'
import type { StorageArea } from '../remote-config'

const memoryStorage = () => {
  const data: Record<string, unknown> = {}
  const area: StorageArea = {
    async get(key) { return { [key]: data[key] } },
    async set(items) { Object.assign(data, items) },
  }
  return { area, data }
}

const response = (asin: string) => ({
  namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
  requestId: 'r', action: 'SELLERSPRITE_KEYWORD_REVERSE', ok: true,
  data: { asin, total: 1, items: [{ keywords: 'stand', searches: 10, products: 1, supplyDemandRatio: 1, trafficPercentage: 0.5, purchaseRate: 0.1, bid: null, bidMin: null, bidMax: null, avgPrice: 9, avgRating: 4, avgReviews: 2, searchesTrend: null, natural: null, ad: null, naturalRatio: null, adRatio: null, positionTypes: null }] },
})

describe('requestKeywordPositionsCached', () => {
  it('fetches once and serves the second call from cache', async () => {
    const { area } = memoryStorage()
    const send = vi.fn(async () => response('B07Z82895W'))
    const cache = new KeywordPositionCache(area)

    const first = await requestKeywordPositionsCached('B07Z82895W', 'US', { send, cache })
    const second = await requestKeywordPositionsCached('B07Z82895W', 'US', { send, cache })

    expect(first.kind).toBe('rows')
    expect(first.cached).toBe(false)
    expect(second.kind).toBe('rows')
    expect(second.cached).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not serve one ASIN from another ASIN cache entry', async () => {
    const { area } = memoryStorage()
    const send = vi.fn(async (message: unknown) => {
      const asin = (message as { request: { payload: { input: { asin: string } } } }).request.payload.input.asin
      return response(asin)
    })
    const cache = new KeywordPositionCache(area)
    await requestKeywordPositionsCached('B07Z82895W', 'US', { send, cache })
    const other = await requestKeywordPositionsCached('B000000000', 'US', { send, cache })
    expect(other.cached).toBe(false)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failure, so a retry actually retries', async () => {
    const { area } = memoryStorage()
    const send = vi.fn(async () => { throw new Error('EXTENSION_UNAVAILABLE') })
    const cache = new KeywordPositionCache(area)
    const first = await requestKeywordPositionsCached('B07Z82895W', 'US', { send, cache })
    const second = await requestKeywordPositionsCached('B07Z82895W', 'US', { send, cache })
    expect(first.kind).toBe('failed')
    expect(second.kind).toBe('failed')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('reports the age of a cached result so the panel can say how fresh it is', async () => {
    const { area } = memoryStorage()
    let now = 1_700_000_000_000
    const cache = new KeywordPositionCache(area, () => now)
    const send = vi.fn(async () => response('B07Z82895W'))
    await requestKeywordPositionsCached('B07Z82895W', 'US', { send, cache })
    now += 90 * 60_000
    const cached = await requestKeywordPositionsCached('B07Z82895W', 'US', { send, cache })
    expect(cached.cached).toBe(true)
    expect(cached.ageMs).toBe(90 * 60_000)
  })

  it('still shows results when the cache cannot be written', async () => {
    const area: StorageArea = {
      async get() { return {} },
      async set() { throw new Error('quota exceeded') },
    }
    const send = vi.fn(async () => response('B07Z82895W'))
    const result = await requestKeywordPositionsCached('B07Z82895W', 'US', { send, cache: new KeywordPositionCache(area) })
    expect(result.kind).toBe('rows')
    expect(result.cached).toBe(false)
  })

  it('surfaces unsupported markets without touching the cache', async () => {
    const { area } = memoryStorage()
    const send = vi.fn(async () => response('B07Z82895W'))
    const result = await requestKeywordPositionsCached('B07Z82895W', 'GB', { send, cache: new KeywordPositionCache(area) })
    expect(result.kind).toBe('unsupported-market')
    expect(send).not.toHaveBeenCalled()
  })

  it('ignores a corrupt cached payload and refetches instead of throwing', async () => {
    const { area } = memoryStorage()
    const key = keywordPositionCacheKey('B07Z82895W', 'US')
    await area.set({ [KEYWORD_POSITION_CACHE_STORAGE_KEY]: { [key]: { storedAt: Date.now(), data: { items: 'not-an-array' } } } })
    const send = vi.fn(async () => response('B07Z82895W'))
    const result = await requestKeywordPositionsCached('B07Z82895W', 'US', {
      send, cache: new KeywordPositionCache(area),
    })
    expect(result.kind).toBe('rows')
    expect(result.cached).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
