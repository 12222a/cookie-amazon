import { describe, expect, it } from 'vitest'
import { AnalysisObjectStore, type StorageArea } from '../analysis-object-store'
import { createAnalysisObject } from '../analysis-object'

const memoryStorage = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial }
  const area: StorageArea = {
    async get(key) { return { [key]: data[key] } },
    async set(items) { Object.assign(data, items) },
  }
  return { area, data }
}

const object = (asin: string, owner: string | null = 'amy') => createAnalysisObject({
  asin, market: 'US', source: 'manual', owner, group: 'team-a', now: 1_700_000_000_000,
})

describe('AnalysisObjectStore', () => {
  it('starts empty', async () => {
    const { area } = memoryStorage()
    expect(await new AnalysisObjectStore(area).read()).toBeNull()
  })

  it('round-trips the current object', async () => {
    const { area } = memoryStorage()
    const store = new AnalysisObjectStore(area)
    const current = object('B07Z82895W')!
    await store.write(current)
    expect(await store.read()).toEqual(current)
  })

  it('survives a new store instance reading the same area, so the selection outlives the popup', async () => {
    const { area } = memoryStorage()
    await new AnalysisObjectStore(area).write(object('B07Z82895W')!)
    expect((await new AnalysisObjectStore(area).read())?.asin).toBe('B07Z82895W')
  })

  it('treats stored garbage as empty instead of throwing', async () => {
    const { area } = memoryStorage({ 'analysis-object:v1': { asin: 'broken' } })
    expect(await new AnalysisObjectStore(area).read()).toBeNull()
  })

  it('returns null when the storage read fails, so the panel falls back to empty state', async () => {
    const area: StorageArea = {
      async get() { throw new Error('storage unavailable') },
      async set() { throw new Error('storage unavailable') },
    }
    expect(await new AnalysisObjectStore(area).read()).toBeNull()
  })

  it('does not reject when the write fails', async () => {
    const area: StorageArea = {
      async get() { return {} },
      async set() { throw new Error('quota exceeded') },
    }
    await expect(new AnalysisObjectStore(area).write(object('B07Z82895W')!)).resolves.toBeUndefined()
  })
})

