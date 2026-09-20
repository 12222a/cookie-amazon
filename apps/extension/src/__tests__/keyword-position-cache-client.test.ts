import { describe, expect, it, vi } from 'vitest'
import { requestKeywordPositionsCached } from '../panel/keyword-position-cache-client'
import { ServerKeywordPositionCache } from '../panel/keyword-position-cache'
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
  it('uses a colleague’s server response on a new machine, then serves the local copy', async () => {
    const server = new Map<string, string>()
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = new URL(String(input)).search
      if (init?.method === 'PUT') { server.set(key, String(init.body)); return new Response(null, { status: 204 }) }
      const body = server.get(key)
      return body === undefined ? new Response(null, { status: 404 }) : new Response(body, { headers: { 'x-cache-age-ms': '60000' } })
    })
    const send = vi.fn(async () => response('B07Z82895W'))
    const amy = new ServerKeywordPositionCache({ token: 'amy', fetcher })
    const ben = new ServerKeywordPositionCache({ token: 'ben', fetcher })
    await requestKeywordPositionsCached('B07Z82895W', 'US', { cache: new KeywordPositionCache(memoryStorage().area), server: amy, send })
    const local = new KeywordPositionCache(memoryStorage().area)
    const shared = await requestKeywordPositionsCached('B07Z82895W', 'US', { cache: local, server: ben, send })
    expect(shared).toMatchObject({ kind: 'rows', cached: true, source: 'server', ageMs: 60_000 })
    expect((await requestKeywordPositionsCached('B07Z82895W', 'US', { cache: local, server: ben, send })).source).toBe('local')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('falls back to taking data when server is unavailable and only writes successful responses', async () => {
    const fetcher = vi.fn(async () => { throw new Error('offline') })
    const server = new ServerKeywordPositionCache({ token: 'amy', fetcher })
    const send = vi.fn(async () => response('B07Z82895W'))
    const result = await requestKeywordPositionsCached('B07Z82895W', 'US', { cache: new KeywordPositionCache(memoryStorage().area), server, send })
    expect(result).toMatchObject({ kind: 'rows', cached: false, source: 'fresh' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not trust a server hit without a valid server age or a usable payload', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [] })))
    const server = new ServerKeywordPositionCache({ token: 'amy', fetcher })
    const send = vi.fn(async () => response('B07Z82895W'))
    const result = await requestKeywordPositionsCached('B07Z82895W', 'US', { cache: new KeywordPositionCache(memoryStorage().area), server, send })
    expect(result.source).toBe('fresh')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('refetches when a server payload has unreadable items and does not cache it locally', async () => {
    const server = new ServerKeywordPositionCache({
      token: 'amy',
      fetcher: vi.fn(async () => new Response('{"items":[null]}', { headers: { 'x-cache-age-ms': '1000' } })),
    })
    const { area } = memoryStorage()
    const cache = new KeywordPositionCache(area)
    const send = vi.fn(async () => {
      expect((await cache.read('B07Z82895W', 'US')).hit).toBe(false)
      return response('B07Z82895W')
    })
    const result = await requestKeywordPositionsCached('B07Z82895W', 'US', { cache, server, send })
    expect(result).toMatchObject({ kind: 'rows', source: 'fresh' })
    expect(send).toHaveBeenCalledTimes(1)
    expect((await cache.read('B07Z82895W', 'US')).hit).toBe(true)
  })

  it.each([401, 413])('keeps showing results when the service responds %i', async (status) => {
    const server = new ServerKeywordPositionCache({ token: 'amy', fetcher: vi.fn(async () => new Response(null, { status })) })
    const send = vi.fn(async () => response('B07Z82895W'))
    const result = await requestKeywordPositionsCached('B07Z82895W', 'US', { cache: new KeywordPositionCache(memoryStorage().area), server, send })
    expect(result).toMatchObject({ kind: 'rows', source: 'fresh' })
    expect(send).toHaveBeenCalledTimes(1)
  })
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
    if (first.kind !== 'rows' || second.kind !== 'rows') throw new Error('expected row results')
    expect(first.summary).toEqual({
      totalKeywords: 1,
      rankedKeywords: 0,
      adKeywords: 0,
      sourceTypeCounts: [],
    })
    expect(second.summary).toEqual(first.summary)
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
