import { describe, expect, it } from 'vitest'
import { ResearchRecordStore } from '../research-record-store'
import { createResearchRecord } from '../research-record'
import type { StorageArea } from '../remote-config'

const memoryStorage = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial }
  const area: StorageArea = {
    async get(key) { return { [key]: data[key] } },
    async set(items) { Object.assign(data, items) },
  }
  return { area, data }
}

const record = (asin: string, owner: string, group: string, summary = '') =>
  createResearchRecord({ asin, market: 'US', owner, group, summary, now: 1_700_000_000_000 })!

describe('ResearchRecordStore', () => {
  it('starts empty', async () => {
    const { area } = memoryStorage()
    expect(await new ResearchRecordStore(area).read()).toEqual([])
  })

  it('saves a record and reads it back', async () => {
    const { area } = memoryStorage()
    const store = new ResearchRecordStore(area)
    await store.save(record('B07Z82895W', 'amy', 'team-a', '值得继续'))
    const records = await store.read()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ asin: 'B07Z82895W', owner: 'amy', summary: '值得继续' })
  })

  it('keeps records for different ASINs side by side', async () => {
    const { area } = memoryStorage()
    const store = new ResearchRecordStore(area)
    await store.save(record('B07Z82895W', 'amy', 'team-a'))
    await store.save(record('B000000000', 'ben', 'team-a'))
    expect((await store.read()).map((item) => item.asin).sort()).toEqual(['B000000000', 'B07Z82895W'])
  })

  it('updates the existing record for the same ASIN instead of piling up duplicates', async () => {
    const { area } = memoryStorage()
    const store = new ResearchRecordStore(area)
    await store.save(record('B07Z82895W', 'amy', 'team-a', 'first'))
    await store.save(record('B07Z82895W', 'amy', 'team-a', 'second'))
    const records = await store.read()
    expect(records).toHaveLength(1)
    expect(records[0]?.summary).toBe('second')
  })

  it('survives a new instance reading the same area, so records outlive the panel', async () => {
    const { area } = memoryStorage()
    await new ResearchRecordStore(area).save(record('B07Z82895W', 'amy', 'team-a'))
    expect(await new ResearchRecordStore(area).read()).toHaveLength(1)
  })

  it('drops malformed stored entries instead of failing the whole read', async () => {
    const { area } = memoryStorage({
      'research-records:v1': [record('B07Z82895W', 'amy', 'team-a'), { asin: 'broken' }, null],
    })
    const records = await new ResearchRecordStore(area).read()
    expect(records).toHaveLength(1)
    expect(records[0]?.asin).toBe('B07Z82895W')
  })

  it('returns an empty list when the read fails', async () => {
    const area: StorageArea = {
      async get() { throw new Error('unavailable') },
      async set() { throw new Error('unavailable') },
    }
    expect(await new ResearchRecordStore(area).read()).toEqual([])
  })

  it('reports a failed write so the panel can tell the user', async () => {
    const area: StorageArea = {
      async get() { return {} },
      async set() { throw new Error('quota exceeded') },
    }
    await expect(new ResearchRecordStore(area).save(record('B07Z82895W', 'amy', 'team-a'))).resolves.toBe(false)
  })
})

