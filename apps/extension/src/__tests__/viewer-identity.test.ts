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
  it('keeps a token, trimmed', () => {
    expect(createViewerIdentity({ token: '  sekrit  ' })).toEqual({ token: 'sekrit' })
  })

  it('refuses an empty or non-string token', () => {
    expect(createViewerIdentity({ token: '' })).toBeNull()
    expect(createViewerIdentity({ token: '   ' })).toBeNull()
    expect(createViewerIdentity({ token: undefined })).toBeNull()
    expect(createViewerIdentity({ token: 42 })).toBeNull()
  })

  it('caps absurd lengths rather than storing them', () => {
    expect(createViewerIdentity({ token: 'x'.repeat(2_000) })?.token).toHaveLength(512)
  })
})

describe('describeViewer', () => {
  it('never renders the token itself', () => {
    const label = describeViewer({ token: 'sekrit' })
    expect(label).not.toContain('sekrit')
    expect(label).toContain('已设置')
  })

  it('does not show a self-declared name, because the server owns identity', () => {
    expect(describeViewer({ token: 'sekrit' })).toBe('访问密钥已设置')
  })

  it('says plainly when no key is set', () => {
    expect(describeViewer(null)).toBe('未设置访问密钥')
  })
})

describe('isViewerIdentity', () => {
  it('accepts a token and rejects partial storage', () => {
    expect(isViewerIdentity({ token: 'sekrit' })).toBe(true)
    expect(isViewerIdentity(null)).toBe(false)
    expect(isViewerIdentity({})).toBe(false)
    expect(isViewerIdentity({ token: '' })).toBe(false)
  })

  it('rejects the old name/group shape, which could claim any identity', () => {
    expect(isViewerIdentity({ name: 'amy', group: 'team-a' })).toBe(false)
  })
})

describe('ViewerIdentityStore', () => {
  it('has no identity until one is set', async () => {
    const { area } = memoryStorage()
    expect(await new ViewerIdentityStore(area).read()).toBeNull()
  })

  it('round-trips the token', async () => {
    const { area } = memoryStorage()
    const store = new ViewerIdentityStore(area)
    await store.write({ token: 'sekrit' })
    expect(await store.read()).toEqual({ token: 'sekrit' })
  })

  it('survives a new instance, so the key is entered once and not per session', async () => {
    const { area } = memoryStorage()
    await new ViewerIdentityStore(area).write({ token: 'sekrit' })
    expect((await new ViewerIdentityStore(area).read())?.token).toBe('sekrit')
  })

  it('clears the token on logout', async () => {
    const { area } = memoryStorage()
    const store = new ViewerIdentityStore(area)
    await store.write({ token: 'sekrit' })
    expect(await store.clear()).toBe(true)
    expect(await store.read()).toBeNull()
  })

  it('treats malformed storage as unset', async () => {
    const { area } = memoryStorage({ 'viewer-identity:v2': { token: '' } })
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
    await expect(new ViewerIdentityStore(area).write({ token: 'sekrit' })).resolves.toBe(false)
  })
})
