import { describe, expect, it } from 'vitest'
import { clampOverlayPosition, overlayMode } from '../panel/overlay-state'
import { createAnalysisObject } from '../analysis-object'

const object = createAnalysisObject({
  asin: 'B07Z82895W', market: 'US', source: 'manual', now: 1_700_000_000_000,
})!

describe('overlayMode', () => {
  it('renders nothing when there is no analysis object', () => {
    expect(overlayMode(null, false)).toBe('hidden')
    expect(overlayMode(null, true)).toBe('hidden')
  })

  it('shrinks to a pill when collapsed, so the entry point stays reachable', () => {
    expect(overlayMode(object, true)).toBe('pill')
  })

  it('shows the full card when expanded', () => {
    expect(overlayMode(object, false)).toBe('card')
  })
})

describe('clampOverlayPosition', () => {
  const viewport = { width: 1000, height: 800 }
  const size = { width: 260, height: 180 }

  it('keeps a position that fits', () => {
    expect(clampOverlayPosition({ x: 100, y: 100 }, size, viewport)).toEqual({ x: 100, y: 100 })
  })

  it('pulls an off-screen position back inside the viewport', () => {
    expect(clampOverlayPosition({ x: 5000, y: 5000 }, size, viewport)).toEqual({ x: 740, y: 620 })
    expect(clampOverlayPosition({ x: -50, y: -50 }, size, viewport)).toEqual({ x: 0, y: 0 })
  })

  it('never returns a negative position when the viewport is smaller than the overlay', () => {
    expect(clampOverlayPosition({ x: 500, y: 500 }, { width: 900, height: 700 }, { width: 300, height: 200 })).toEqual({ x: 0, y: 0 })
  })
})
