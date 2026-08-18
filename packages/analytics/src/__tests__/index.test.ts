import { describe, expect, it } from 'vitest'
import type { SellerSpriteProductSelectionData } from '@cookie-amazon/protocol'
import {
  buildSeries,
  computeTrend,
  computeTrends,
  toSnapshot,
  type ProductSnapshot,
} from '../index'

const item = (
  asin: string,
  overrides: Partial<SellerSpriteProductSelectionData['items'][number]> = {},
): SellerSpriteProductSelectionData['items'][number] => ({
  asin,
  title: `title-${asin}`,
  brand: null,
  imageUrl: null,
  price: 10,
  rating: 4,
  reviews: 100,
  estimatedSales: 500,
  ...overrides,
})

const data = (
  items: SellerSpriteProductSelectionData['items'],
): SellerSpriteProductSelectionData => ({
  page: 1,
  pages: 1,
  size: items.length,
  total: items.length,
  hasNextPage: false,
  items,
})

const meta = (snapshotId: string, capturedAt: number) => ({
  snapshotId,
  capturedAt,
  market: 'US',
  selectType: 'CATEGORY',
})

describe('toSnapshot', () => {
  it('normalizes envelope into a timestamped snapshot with frozen fields', () => {
    const snapshot = toSnapshot(data([item('A1')]), meta('s1', 1000))
    expect(snapshot).toEqual({
      snapshotId: 's1',
      capturedAt: 1000,
      market: 'US',
      selectType: 'CATEGORY',
      page: 1,
      total: 1,
      observations: [
        {
          asin: 'A1',
          title: 'title-A1',
          brand: null,
          imageUrl: null,
          price: 10,
          rating: 4,
          reviews: 100,
          estimatedSales: 500,
        },
      ],
    })
  })

  it('handles an empty product list', () => {
    const snapshot = toSnapshot(data([]), meta('s0', 500))
    expect(snapshot.observations).toEqual([])
    expect(snapshot.total).toBe(0)
  })
})

describe('buildSeries', () => {
  it('groups observations by asin and orders points ascending by time', () => {
    const snapshots: ProductSnapshot[] = [
      toSnapshot(data([item('A1', { price: 30 })]), meta('s3', 3000)),
      toSnapshot(data([item('A1', { price: 10 })]), meta('s1', 1000)),
      toSnapshot(data([item('A1', { price: 20 }), item('A2', { price: 5 })]), meta('s2', 2000)),
    ]
    const series = buildSeries(snapshots)
    const a1 = series.find((s) => s.asin === 'A1')
    expect(a1?.points.map((p) => p.capturedAt)).toEqual([1000, 2000, 3000])
    expect(a1?.points.map((p) => p.observation.price)).toEqual([10, 20, 30])
    expect(series.find((s) => s.asin === 'A2')?.points).toHaveLength(1)
  })

  it('returns an empty list when there are no snapshots', () => {
    expect(buildSeries([])).toEqual([])
  })
})

describe('computeTrend', () => {
  it('computes absolute and relative change with an upward direction', () => {
    const series = buildSeries([
      toSnapshot(data([item('A1', { price: 10 })]), meta('s1', 1000)),
      toSnapshot(data([item('A1', { price: 15 })]), meta('s2', 2000)),
    ])
    const trend = computeTrend(series[0], 'price')
    expect(trend.first).toBe(10)
    expect(trend.last).toBe(15)
    expect(trend.absoluteChange).toBe(5)
    expect(trend.relativeChange).toBeCloseTo(0.5)
    expect(trend.direction).toBe('up')
    expect(trend.sampleCount).toBe(2)
  })

  it('reports flat direction when values are unchanged', () => {
    const series = buildSeries([
      toSnapshot(data([item('A1', { reviews: 100 })]), meta('s1', 1000)),
      toSnapshot(data([item('A1', { reviews: 100 })]), meta('s2', 2000)),
    ])
    expect(computeTrend(series[0], 'reviews').direction).toBe('flat')
  })

  it('reports down direction and null relative change when base is zero', () => {
    const series = buildSeries([
      toSnapshot(data([item('A1', { estimatedSales: 0 })]), meta('s1', 1000)),
      toSnapshot(data([item('A1', { estimatedSales: -5 })]), meta('s2', 2000)),
    ])
    const trend = computeTrend(series[0], 'estimatedSales')
    expect(trend.absoluteChange).toBe(-5)
    expect(trend.relativeChange).toBeNull()
    expect(trend.direction).toBe('down')
  })

  it('marks direction unknown and skips null metric points', () => {
    const series = buildSeries([
      toSnapshot(data([item('A1', { rating: null })]), meta('s1', 1000)),
      toSnapshot(data([item('A1', { rating: null })]), meta('s2', 2000)),
    ])
    const trend = computeTrend(series[0], 'rating')
    expect(trend.first).toBeNull()
    expect(trend.last).toBeNull()
    expect(trend.absoluteChange).toBeNull()
    expect(trend.direction).toBe('unknown')
    expect(trend.sampleCount).toBe(0)
  })
})

describe('computeTrends', () => {
  it('computes a trend per series', () => {
    const series = buildSeries([
      toSnapshot(data([item('A1', { price: 10 }), item('A2', { price: 8 })]), meta('s1', 1000)),
      toSnapshot(data([item('A1', { price: 12 }), item('A2', { price: 6 })]), meta('s2', 2000)),
    ])
    const trends = computeTrends(series, 'price')
    expect(trends).toHaveLength(2)
    expect(trends.find((t) => t.asin === 'A1')?.direction).toBe('up')
    expect(trends.find((t) => t.asin === 'A2')?.direction).toBe('down')
  })
})