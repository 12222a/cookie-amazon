import { describe, expect, it } from 'vitest'
import { KeywordPositionCache, KEYWORD_POSITION_CACHE_STORAGE_KEY, keywordPositionCacheKey, CACHE_TTL_MS } from '../panel/keyword-position-cache'
import type { StorageArea } from '../remote-config'

const memoryStorage = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial }
  const area: StorageArea = {
    async get(key) { return { [key]: data[key] } },
    async set(items) { Object.assign(data, items) },
  }
  return { area, data }
}

const payload = { asin: 'B07Z82895W', total: 1, items: [] }

describe('keywordPositionCacheKey', () => {
  it('is stable for the same ASIN and market', () => {
    expect(keywordPositionCacheKey('B07Z82895W', 'US')).toBe(keywordPositionCacheKey('B07Z82895W', 'US'))
  })

  it('differs across ASINs and across markets', () => {
    expect(keywordPositionCacheKey('B07Z82895W', 'US')).not.toBe(keywordPositionCacheKey('B000000000', 'US'))
    expect(keywordPositionCacheKey('B07Z82895W', 'US')).not.toBe(keywordPositionCacheKey('B07Z82895W', 'GB'))
  })

  it('normalizes case so the same request cannot occupy two slots', () => {
    expect(keywordPositionCacheKey(' b07z82895w ', 'us')).toBe(keywordPositionCacheKey('B07Z82895W', 'US'))
  })
})

describe('KeywordPositionCache', () => {
  it('keeps local entries separate when the access key changes', async () => {
    const { area } = memoryStorage()
    const amy = new KeywordPositionCache(area, Date.now, 'amy-token')
    const eve = new KeywordPositionCache(area, Date.now, 'eve-token')
    await amy.write('B07Z82895W', 'US', payload)
    expect((await amy.read('B07Z82895W', 'US')).hit).toBe(true)
    expect(await eve.read('B07Z82895W', 'US')).toEqual({ hit: false })
    expect(await new KeywordPositionCache(area).read('B07Z82895W', 'US')).toEqual({ hit: false })
  })

  it('retains server age when warming local cache', async () => {
    const { area } = memoryStorage()
    let now = 1_700_000_000_000
    const cache = new KeywordPositionCache(area, () => now)
    await cache.write('B07Z82895W', 'US', payload, CACHE_TTL_MS - 60_000)
    now += 60_000
    expect(await cache.read('B07Z82895W', 'US')).toEqual({ hit: false })
  })
  it('misses when nothing has been stored', async () => {
    const { area } = memoryStorage()
    const cache = new KeywordPositionCache(area)
    expect(await cache.read('B07Z82895W', 'US')).toEqual({ hit: false })
  })

  it('returns a hit with the stored payload inside the window', async () => {
    const { area } = memoryStorage()
    const now = 1_700_000_000_000
    const cache = new KeywordPositionCache(area, () => now)
    await cache.write('B07Z82895W', 'US', payload)
    expect(await cache.read('B07Z82895W', 'US')).toEqual({ hit: true, data: payload, ageMs: 0 })
  })

  it('misses once the entry is older than the 24 hour window', async () => {
    const { area } = memoryStorage()
    let now = 1_700_000_000_000
    const cache = new KeywordPositionCache(area, () => now)
    await cache.write('B07Z82895W', 'US', payload)
    now += CACHE_TTL_MS
    expect(await cache.read('B07Z82895W', 'US')).toEqual({ hit: false })
  })

  it('keeps separate entries per ASIN so one lookup cannot serve another', async () => {
    const { area } = memoryStorage()
    const cache = new KeywordPositionCache(area)
    await cache.write('B07Z82895W', 'US', payload)
    expect(await cache.read('B000000000', 'US')).toEqual({ hit: false })
    expect((await cache.read('B07Z82895W', 'US')).hit).toBe(true)
  })

  it('treats a malformed stored entry as a miss rather than returning junk', async () => {
    const { area } = memoryStorage()
    const key = keywordPositionCacheKey('B07Z82895W', 'US')
    await area.set({ [KEYWORD_POSITION_CACHE_STORAGE_KEY]: { [key]: { storedAt: 'yesterday', data: payload } } })
    expect(await new KeywordPositionCache(area).read('B07Z82895W', 'US')).toEqual({ hit: false })
  })

  it('reports a failed write so the caller can carry on without caching', async () => {
    const area: StorageArea = {
      async get() { return {} },
      async set() { throw new Error('quota exceeded') },
    }
    await expect(new KeywordPositionCache(area).write('B07Z82895W', 'US', payload)).resolves.toBe(false)
  })

  it('reports a miss, not an error, when the read fails', async () => {
    const area: StorageArea = {
      async get() { throw new Error('unavailable') },
      async set() { return },
    }
    expect(await new KeywordPositionCache(area).read('B07Z82895W', 'US')).toEqual({ hit: false })
  })

  it('drops entries older than the window so storage does not grow without bound', async () => {
    const { area } = memoryStorage()
    let now = 1_700_000_000_000
    const cache = new KeywordPositionCache(area, () => now)
    await cache.write('B07Z82895W', 'US', payload)
    await cache.write('B000000000', 'US', payload)
    now += CACHE_TTL_MS + 1
    await cache.write('B0000000000', 'US', payload)
    const stored = (await area.get(KEYWORD_POSITION_CACHE_STORAGE_KEY))[KEYWORD_POSITION_CACHE_STORAGE_KEY] as Record<string, unknown>
    expect(Object.keys(stored)).toHaveLength(1)
  })
})
