import { describe, expect, it } from 'vitest'
import { initialOverlayPosition, OVERLAY_WIDTH, OVERLAY_HEIGHT } from '../panel/overlay-placement'

describe('initialOverlayPosition', () => {
  it('sits near the bottom-right corner, away from prices and the buy box', () => {
    expect(initialOverlayPosition({ width: 1280, height: 900 })).toEqual({
      x: 1280 - OVERLAY_WIDTH - 24,
      y: 900 - OVERLAY_HEIGHT - 24,
    })
  })

  it('never returns a negative position on a viewport smaller than the overlay', () => {
    expect(initialOverlayPosition({ width: 200, height: 150 })).toEqual({ x: 0, y: 0 })
  })
})

