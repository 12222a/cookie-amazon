import { describe, expect, it } from 'vitest'
import { OverlayController, type OverlayView } from '../panel/overlay-controller'
import { createAnalysisObject, type AnalysisObject } from '../analysis-object'
import type { OverlayMode, OverlayPosition } from '../panel/overlay-state'

const object = (asin = 'B07Z82895W'): AnalysisObject => createAnalysisObject({
  asin, market: 'US', source: 'manual', now: 1_700_000_000_000,
})!

type Rendered = { mode: OverlayMode; asin: string | null }

const harness = (options: {
  viewFails?: boolean,
  objects?: Array<AnalysisObject | null>,
} = {}) => {
  const rendered: Rendered[] = []
  let created = 0
  let removed = 0
  let reads = 0
  let viewFails = options.viewFails ?? false
  const queue = options.objects ?? [object()]
  let writes: Array<{ collapsed: boolean; position: OverlayPosition | null }> = []

  const controller = new OverlayController({
    createView: (): OverlayView | null => {
      created += 1
      return {
        render(current, mode) {
          rendered.push({ mode, asin: current?.asin ?? null })
          if (viewFails) throw new Error('render exploded')
        },
        remove() { removed += 1 },
      }
    },
    readObject: async () => {
      reads += 1
      return queue[Math.min(reads - 1, queue.length - 1)] ?? null
    },
    readPreference: async () => ({ collapsed: false, position: null }),
    writePreference: async (preference) => { writes.push(preference); return true },
    initialPosition: () => ({ x: 10, y: 20 }),
  })

  return {
    controller,
    rendered,
    writes,
    counts: () => ({ created, removed, reads }),
    failNextRender: () => { viewFails = true },
  }
}

describe('OverlayController', () => {
  it('creates one view and renders the current object', async () => {
    const h = harness()
    await h.controller.sync()
    expect(h.counts().created).toBe(1)
    expect(h.rendered).toEqual([{ mode: 'card', asin: 'B07Z82895W' }])
  })

  it('creates nothing when there is no analysis object', async () => {
    const h = harness({ objects: [null] })
    await h.controller.sync()
    expect(h.counts().created).toBe(0)
    expect(h.rendered).toEqual([])
  })

  it('removes the view instead of leaving stale content when rendering fails', async () => {
    const h = harness({ viewFails: true })
    await h.controller.sync()
    expect(h.counts().removed).toBe(1)
  })

  it('reuses the same view across consecutive syncs from storage changes', async () => {
    const h = harness({ objects: [object('B07Z82895W'), object('B000000000')] })
    await h.controller.sync()
    await h.controller.sync()
    expect(h.counts().created).toBe(1)
    expect(h.rendered.map((entry) => entry.asin)).toEqual(['B07Z82895W', 'B000000000'])
  })

  it('never mounts twice when two storage changes overlap', async () => {
    const h = harness({ objects: [object(), object()] })
    await Promise.all([h.controller.sync(), h.controller.sync(), h.controller.sync()])
    expect(h.counts().created).toBe(1)
  })

  it('removes the view once the object disappears', async () => {
    const h = harness({ objects: [object(), null] })
    await h.controller.sync()
    await h.controller.sync()
    expect(h.counts().removed).toBe(1)
  })

  it('persists collapse toggles without dropping the saved position', async () => {
    const h = harness()
    await h.controller.sync()
    await h.controller.move({ x: 50, y: 60 })
    await h.controller.toggleCollapsed()
    expect(h.writes).toEqual([
      { collapsed: false, position: { x: 50, y: 60 } },
      { collapsed: true, position: { x: 50, y: 60 } },
    ])
  })

  it('renders the pill mode once collapsed', async () => {
    const h = harness()
    await h.controller.sync()
    await h.controller.toggleCollapsed()
    expect(h.rendered.map((entry) => entry.mode)).toEqual(['card', 'pill'])
  })
})

