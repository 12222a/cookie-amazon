import { describe, expect, it } from 'vitest'
import {
  buildSeries,
  computeTrends,
  filterTrends,
  seriesToCsv,
  sortTrends,
  toSnapshot,
  toSparkline,
  trendsToCsv,
  type ProductSeries,
  type ProductSnapshot,
  type ProductTrend,
} from '../index'
import type { SellerSpriteProductSelectionData } from '@cookie-amazon/protocol'

const trend = (overrides: Partial<ProductTrend> = {}): ProductTrend => ({
  asin: 'A1',
  title: 'title-A1',
  metric: 'price',
  first: 10,
  last: 12,
  absoluteChange: 2,
  relativeChange: 0.2,
  direction: 'up',
  sampleCount: 2,
  ...overrides,
})

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
  availableDate: null,
  availableDays: null,
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

describe('sortTrends', () => {
  it('sorts numeric key ascending and descending without mutating input', () => {
    const input = [
      trend({ asin: 'A1', last: 30 }),
      trend({ asin: 'A2', last: 10 }),
      trend({ asin: 'A3', last: 20 }),
    ]
    const asc = sortTrends(input, 'last', 'asc')
    expect(asc.map((t) => t.last)).toEqual([10, 20, 30])
    expect(sortTrends(input, 'last', 'desc').map((t) => t.last)).toEqual([30, 20, 10])
    expect(input.map((t) => t.last)).toEqual([30, 10, 20])
  })

  it('sorts string key with locale compare', () => {
    const input = [trend({ asin: 'B' }), trend({ asin: 'A' }), trend({ asin: 'C' })]
    expect(sortTrends(input, 'asin', 'asc').map((t) => t.asin)).toEqual(['A', 'B', 'C'])
  })

  it('places null values last regardless of direction and stays stable', () => {
    const input = [
      trend({ asin: 'A1', absoluteChange: null }),
      trend({ asin: 'A2', absoluteChange: 5 }),
      trend({ asin: 'A3', absoluteChange: null }),
      trend({ asin: 'A4', absoluteChange: 1 }),
    ]
    const asc = sortTrends(input, 'absoluteChange', 'asc')
    expect(asc.map((t) => t.asin)).toEqual(['A4', 'A2', 'A1', 'A3'])
    const desc = sortTrends(input, 'absoluteChange', 'desc')
    expect(desc.map((t) => t.asin)).toEqual(['A2', 'A4', 'A1', 'A3'])
  })

  it('keeps original order for equal values (stable)', () => {
    const input = [
      trend({ asin: 'A1', sampleCount: 2 }),
      trend({ asin: 'A2', sampleCount: 2 }),
      trend({ asin: 'A3', sampleCount: 2 }),
    ]
    expect(sortTrends(input, 'sampleCount', 'desc').map((t) => t.asin)).toEqual([
      'A1',
      'A2',
      'A3',
    ])
  })
})

describe('filterTrends', () => {
  const input = [
    trend({ asin: 'A1', title: 'Red Widget', direction: 'up', sampleCount: 3 }),
    trend({ asin: 'A2', title: 'Blue Gadget', direction: 'down', sampleCount: 1 }),
    trend({ asin: 'A3', title: null, direction: 'up', sampleCount: 5 }),
  ]

  it('filters by direction', () => {
    expect(filterTrends(input, { direction: 'up' }).map((t) => t.asin)).toEqual(['A1', 'A3'])
  })

  it('filters by minimum sample count', () => {
    expect(filterTrends(input, { minSampleCount: 3 }).map((t) => t.asin)).toEqual(['A1', 'A3'])
  })

  it('filters by case-insensitive query over asin and title', () => {
    expect(filterTrends(input, { query: 'widget' }).map((t) => t.asin)).toEqual(['A1'])
    expect(filterTrends(input, { query: 'a3' }).map((t) => t.asin)).toEqual(['A3'])
  })

  it('combines criteria and returns empty when nothing matches', () => {
    expect(filterTrends(input, { direction: 'up', minSampleCount: 4 }).map((t) => t.asin)).toEqual([
      'A3',
    ])
    expect(filterTrends(input, { direction: 'flat' })).toEqual([])
  })

  it('returns all trends when criteria is empty', () => {
    expect(filterTrends(input, {})).toHaveLength(3)
  })
})

describe('toSparkline', () => {
  const seriesOf = (prices: (number | null)[]): ProductSeries =>
    buildSeries(
      prices.map((price, index) =>
        toSnapshot(data([item('A1', { price })]), meta(`s${index}`, (index + 1) * 1000)),
      ),
    )[0]

  it('returns hasData=false for an empty series', () => {
    expect(toSparkline({ asin: 'A1', points: [] }, 'price')).toEqual({
      points: '',
      width: 120,
      height: 32,
      hasData: false,
    })
  })

  it('returns hasData=false for a single point', () => {
    expect(toSparkline(seriesOf([10]), 'price').hasData).toBe(false)
  })

  it('normalizes multi-point values across the height', () => {
    const spark = toSparkline(seriesOf([10, 20]), 'price', { width: 100, height: 40 })
    expect(spark.hasData).toBe(true)
    expect(spark.points).toBe('0,40 100,0')
  })

  it('flattens equal values to the vertical midline', () => {
    const spark = toSparkline(seriesOf([5, 5, 5]), 'price', { width: 100, height: 40 })
    expect(spark.points).toBe('0,20 50,20 100,20')
  })

  it('skips null metric values before normalizing', () => {
    const spark = toSparkline(seriesOf([10, null, 30]), 'price', { width: 100, height: 40 })
    expect(spark.points).toBe('0,40 100,0')
  })
})

describe('trendsToCsv', () => {
  it('emits a header row and escapes commas, quotes and newlines', () => {
    const csv = trendsToCsv([
      trend({ asin: 'A1', title: 'Plain' }),
      trend({ asin: 'A2', title: 'Has, comma' }),
      trend({ asin: 'A3', title: 'Has "quote"' }),
      trend({ asin: 'A4', title: 'Line\nbreak' }),
      trend({ asin: 'A5', title: null, first: null }),
    ])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(
      'asin,title,metric,first,last,absoluteChange,relativeChange,direction,sampleCount',
    )
    expect(lines[1]).toBe('A1,Plain,price,10,12,2,0.2,up,2')
    expect(lines[2]).toBe('A2,"Has, comma",price,10,12,2,0.2,up,2')
    expect(lines[3]).toBe('A3,"Has ""quote""",price,10,12,2,0.2,up,2')
    expect(csv).toContain('"Line\nbreak"')
    expect(csv.endsWith('A5,,price,,12,2,0.2,up,2')).toBe(true)
  })

  it('emits only the header for empty input', () => {
    expect(trendsToCsv([])).toBe(
      'asin,title,metric,first,last,absoluteChange,relativeChange,direction,sampleCount',
    )
  })
})

describe('seriesToCsv', () => {
  it('expands series points into a long table with a header', () => {
    const series = buildSeries([
      toSnapshot(data([item('A1', { price: 10 })]), meta('s1', 1000)),
      toSnapshot(data([item('A1', { price: 12 }), item('A2', { price: 5 })]), meta('s2', 2000)),
    ])
    const csv = seriesToCsv(series, 'price')
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('asin,title,capturedAt,value')
    expect(lines).toContain('A1,title-A1,1000,10')
    expect(lines).toContain('A1,title-A1,2000,12')
    expect(lines).toContain('A2,title-A2,2000,5')
  })

  it('emits only the header for empty input', () => {
    expect(seriesToCsv([], 'price')).toBe('asin,title,capturedAt,value')
  })

  it('leaves value empty for null metric points', () => {
    const series = buildSeries([
      toSnapshot(data([item('A1', { rating: null })]), meta('s1', 1000)),
    ])
    expect(seriesToCsv(series, 'rating')).toBe('asin,title,capturedAt,value\r\nA1,title-A1,1000,')
  })
})

describe('computeTrends integration with sort and filter', () => {
  it('sorts computed trends by last value', () => {
    const snapshots: ProductSnapshot[] = [
      toSnapshot(data([item('A1', { price: 10 }), item('A2', { price: 40 })]), meta('s1', 1000)),
      toSnapshot(data([item('A1', { price: 20 }), item('A2', { price: 30 })]), meta('s2', 2000)),
    ]
    const trends = computeTrends(buildSeries(snapshots), 'price')
    expect(sortTrends(trends, 'last', 'desc').map((t) => t.asin)).toEqual(['A2', 'A1'])
  })
})