import { describe, expect, it } from 'vitest'
import { OverlayPreferenceStore } from '../panel/overlay-preference-store'
import type { StorageArea } from '../remote-config'

const memoryStorage = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial }
  const area: StorageArea = {
    async get(key) { return { [key]: data[key] } },
    async set(items) { Object.assign(data, items) },
  }
  return { area, data }
}

describe('OverlayPreferenceStore', () => {
  it('defaults to collapsed with no saved position', async () => {
    const { area } = memoryStorage()
    expect(await new OverlayPreferenceStore(area).read()).toEqual({ collapsed: true, position: null })
  })

  it('round-trips collapse state and position', async () => {
    const { area } = memoryStorage()
    const store = new OverlayPreferenceStore(area)
    await store.write({ collapsed: false, position: { x: 40, y: 60 } })
    expect(await store.read()).toEqual({ collapsed: false, position: { x: 40, y: 60 } })
  })

  it('survives a new instance reading the same area, so the choice outlives the page', async () => {
    const { area } = memoryStorage()
    await new OverlayPreferenceStore(area).write({ collapsed: false, position: null })
    expect((await new OverlayPreferenceStore(area).read()).collapsed).toBe(false)
  })

  it('treats a missing or malformed record as collapsed', async () => {
    const { area } = memoryStorage({ 'overlay-preference:v1': { collapsed: 'yes' } })
    const read = await new OverlayPreferenceStore(area).read()
    expect(read.collapsed).toBe(true)
    expect(read.position).toBeNull()
  })

  it('discards a malformed position rather than placing the overlay off-screen', async () => {
    const { area } = memoryStorage({ 'overlay-preference:v1': { collapsed: false, position: { x: 'NaN', y: null } } })
    const read = await new OverlayPreferenceStore(area).read()
    expect(read.collapsed).toBe(false)
    expect(read.position).toBeNull()
  })

  it('falls back to the default when the read fails', async () => {
    const area: StorageArea = {
      async get() { throw new Error('unavailable') },
      async set() { throw new Error('unavailable') },
    }
    expect(await new OverlayPreferenceStore(area).read()).toEqual({ collapsed: true, position: null })
  })

  it('reports a failed write', async () => {
    const area: StorageArea = {
      async get() { return {} },
      async set() { throw new Error('quota exceeded') },
    }
    await expect(new OverlayPreferenceStore(area).write({ collapsed: false, position: null })).resolves.toBe(false)
  })
})
