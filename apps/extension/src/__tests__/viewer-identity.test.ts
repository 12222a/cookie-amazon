import { describe, expect, it } from 'vitest'
import { createViewerIdentity, describeViewer, isViewerIdentity, ViewerIdentityStore } from '../viewer-identity'
import type { StorageArea } from '../remote-config'

const memoryStorage = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial }
  const area: StorageArea = {
    async get(key) { return { [key]: data[key] } },
    async set(items) { Object.assign(data, items) },
  }
  return { area, data }
}

describe('createViewerIdentity', () => {
  it('keeps a name and a group', () => {
    expect(createViewerIdentity({ name: ' amy ', group: ' team-a ' })).toEqual({ name: 'amy', group: 'team-a' })
  })

  it('refuses an identity missing either half, because归组 is the point', () => {
    expect(createViewerIdentity({ name: '', group: 'team-a' })).toBeNull()
    expect(createViewerIdentity({ name: 'amy', group: '   ' })).toBeNull()
  })

  it('caps absurd lengths rather than storing them', () => {
    expect(createViewerIdentity({ name: 'x'.repeat(200), group: 'team-a' })?.name).toHaveLength(64)
    expect(createViewerIdentity({ name: 'amy', group: 'y'.repeat(200) })?.group).toHaveLength(64)
  })
})

describe('describeViewer', () => {
  it('names the identity for the panel header', () => {
    expect(describeViewer({ name: 'amy', group: 'team-a' })).toBe('amy · team-a')
  })

  it('says plainly when nobody has identified themselves yet', () => {
    expect(describeViewer(null)).toBe('未设置身份')
  })
})

describe('isViewerIdentity', () => {
  it('accepts a complete identity', () => {
    expect(isViewerIdentity({ name: 'amy', group: 'team-a' })).toBe(true)
  })

  it('rejects partial storage', () => {
    expect(isViewerIdentity(null)).toBe(false)
    expect(isViewerIdentity({ name: 'amy' })).toBe(false)
    expect(isViewerIdentity({ name: '', group: 'team-a' })).toBe(false)
  })
})

describe('ViewerIdentityStore', () => {
  it('has no identity until one is set', async () => {
    const { area } = memoryStorage()
    expect(await new ViewerIdentityStore(area).read()).toBeNull()
  })

  it('round-trips the identity', async () => {
    const { area } = memoryStorage()
    const store = new ViewerIdentityStore(area)
    await store.write({ name: 'amy', group: 'team-a' })
    expect(await store.read()).toEqual({ name: 'amy', group: 'team-a' })
  })

  it('survives a new instance, so identity is set once and not per session', async () => {
    const { area } = memoryStorage()
    await new ViewerIdentityStore(area).write({ name: 'amy', group: 'team-a' })
    expect((await new ViewerIdentityStore(area).read())?.name).toBe('amy')
  })

  it('treats malformed storage as unset', async () => {
    const { area } = memoryStorage({ 'viewer-identity:v1': { name: 'amy' } })
    expect(await new ViewerIdentityStore(area).read()).toBeNull()
  })

  it('returns null when the read fails', async () => {
    const area: StorageArea = {
      async get() { throw new Error('unavailable') },
      async set() { throw new Error('unavailable') },
    }
    expect(await new ViewerIdentityStore(area).read()).toBeNull()
  })

  it('reports a failed write', async () => {
    const area: StorageArea = {
      async get() { return {} },
      async set() { throw new Error('quota exceeded') },
    }
    await expect(new ViewerIdentityStore(area).write({ name: 'amy', group: 'team-a' })).resolves.toBe(false)
  })
})

