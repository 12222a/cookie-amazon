import { describe, expect, it } from 'vitest'
import {
  describeKeywordPositionSummary,
  describeKeywordPositions,
  describeKeywordTrend,
  POSITION_TYPE_LABELS,
} from '../keyword-positions'
import type { SellerSpriteKeywordReverseData } from '@cookie-amazon/protocol'
const item = (over: Partial<SellerSpriteKeywordReverseData['items'][number]> = {}) => ({
  keywords: 'phone stand',
  searches: 100,
  products: null,
  supplyDemandRatio: null,
  trafficPercentage: null,
  purchaseRate: null,
  bid: null,
  bidMin: null,
  bidMax: null,
  avgPrice: null,
  avgRating: null,
  avgReviews: null,
  searchesTrend: null,
  natural: null,
  ad: null,
  naturalRatio: null,
  adRatio: null,
  positionTypes: null,
  ...over,
})
const data = (items: ReturnType<typeof item>[]): SellerSpriteKeywordReverseData => ({
  asin: 'B0ABCDEFGH',
  total: items.length,
  items,
})
describe('keyword position rows', () => {
  it('formats a natural rank on page one as a bare number', () => {
    const [row] = describeKeywordPositions(data([item({ natural: { page: 1, rank: 6 } })]))
    expect(row?.natural).toBe('6')
  })
  it('names the page when the rank sits beyond page one', () => {
    const [row] = describeKeywordPositions(data([item({ natural: { page: 2, rank: 107 } })]))
    expect(row?.natural).toBe('第 2 页 · 107')
  })
  it('shows an em dash for every missing field instead of guessing a value', () => {
    const [row] = describeKeywordPositions(data([item()]))
    expect(row).toEqual({
      keyword: 'phone stand',
      natural: '—',
      ad: '—',
      naturalShare: '—',
      adShare: '—',
      types: '—',
      trend: { kind: 'unavailable' },
    })
  })
  it('renders ratios as percentages', () => {
    const [row] = describeKeywordPositions(data([item({ naturalRatio: 0.76, adRatio: 0.24 })]))
    expect(row?.naturalShare).toBe('76%')
    expect(row?.adShare).toBe('24%')
  })
  it('translates known position codes and passes unknown ones through', () => {
    const [row] = describeKeywordPositions(data([item({ positionTypes: ['NT', 'SPONSOR_BRAND'] })]))
    expect(row?.types).toBe('自然搜索词、品牌广告词')
    const [unusual] = describeKeywordPositions(data([item({ positionTypes: ['SOMETHING_NEW'] })]))
    expect(unusual?.types).toBe('SOMETHING_NEW')
  })
  it('keeps every keyword, including ones with no readable position at all', () => {
    const rows = describeKeywordPositions(data([
      item({ keywords: 'a', natural: { page: 1, rank: 3 } }),
      item({ keywords: 'b', positionTypes: ['ADS'] }),
    ]))
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.keyword)).toEqual(['a', 'b'])
  })
  it('handles a rank with a missing page number without inventing page one', () => {
    const [row] = describeKeywordPositions(data([item({ natural: { page: null, rank: 12 } })]))
    expect(row?.natural).toBe('12')
  })

  it('shows unknown when only a page is known, because a page is not a rank', () => {
    const [row] = describeKeywordPositions(data([item({ natural: { page: 2, rank: null } })]))
    expect(row?.natural).toBe('—')
    const [both] = describeKeywordPositions(data([item({ natural: { page: null, rank: null } })]))
    expect(both?.natural).toBe('—')
  })

  it('treats an already-percent share as percent instead of multiplying again', () => {
    const [fraction] = describeKeywordPositions(data([item({ naturalRatio: 0.76 })]))
    expect(fraction?.naturalShare).toBe('76%')
    const [percent] = describeKeywordPositions(data([item({ naturalRatio: 76 })]))
    expect(percent?.naturalShare).toBe('76%')
  })

  it('shows unknown for a negative or non-finite share instead of a nonsense percentage', () => {
    const [negative] = describeKeywordPositions(data([item({ naturalRatio: -1 })]))
    expect(negative?.naturalShare).toBe('—')
    const [infinite] = describeKeywordPositions(data([item({ adRatio: Number.POSITIVE_INFINITY })]))
    expect(infinite?.adShare).toBe('—')
  })
  it('returns an empty list for an empty response', () => {
    expect(describeKeywordPositions(data([]))).toEqual([])
  })
})

describe('keyword search volume trend', () => {
  it('draws a line only after six usable monthly samples', () => {
    const result = describeKeywordTrend([
      { month: '2026-01', searchRank: null, searches: 100 },
      { month: '2026-02', searchRank: null, searches: 120 },
      { month: '2026-03', searchRank: null, searches: 110 },
      { month: '2026-04', searchRank: null, searches: 140 },
      { month: '2026-05', searchRank: null, searches: 160 },
      { month: '2026-06', searchRank: null, searches: 180 },
    ])
    expect(result.kind).toBe('line')
    if (result.kind !== 'line') return
    expect(result.pointCount).toBe(6)
    expect(result.sampleCount).toBe(6)
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]).toHaveLength(6)
    expect(result.segments[0]?.[0]).toEqual({ month: '2026-01', searches: 100, index: 0 })
    expect(result.segments[0]?.[5]).toEqual({ month: '2026-06', searches: 180, index: 5 })
  })

  it('marks fewer than six usable samples as insufficient', () => {
    expect(describeKeywordTrend([
      { month: '2026-01', searchRank: null, searches: 100 },
      { month: '2026-02', searchRank: null, searches: null },
      { month: '2026-03', searchRank: null, searches: 110 },
      { month: '2026-04', searchRank: null, searches: 140 },
      { month: '2026-05', searchRank: null, searches: 160 },
      { month: '2026-06', searchRank: null, searches: 180 },
    ])).toEqual({ kind: 'insufficient', sampleCount: 5 })
  })

  it('leaves a gap instead of connecting across a missing month', () => {
    const result = describeKeywordTrend([
      { month: '2026-01', searchRank: null, searches: 100 },
      { month: '2026-02', searchRank: null, searches: 120 },
      { month: '2026-04', searchRank: null, searches: 140 },
      { month: '2026-05', searchRank: null, searches: 160 },
      { month: '2026-06', searchRank: null, searches: 180 },
      { month: '2026-07', searchRank: null, searches: 200 },
    ])
    expect(result.kind).toBe('line')
    if (result.kind !== 'line') return
    expect(result.sampleCount).toBe(6)
    expect(result.pointCount).toBe(7)
    expect(result.segments.map((segment) => segment.length)).toEqual([2, 4])
    expect(result.segments[0]?.[1]).toEqual({ month: '2026-02', searches: 120, index: 1 })
    expect(result.segments[1]?.[0]).toEqual({ month: '2026-04', searches: 140, index: 3 })
  })

  it('sorts months, filters invalid months, and keeps only the latest twelve months', () => {
    const result = describeKeywordTrend([
      { month: '2025-12', searchRank: null, searches: 1 },
      { month: '2026-12', searchRank: null, searches: 13 },
      { month: 'not-a-month', searchRank: null, searches: 999 },
      { month: '2026-03', searchRank: null, searches: 4 },
      { month: '2026-13', searchRank: null, searches: 999 },
      { month: '2026-01', searchRank: null, searches: 2 },
      { month: '2026-02', searchRank: null, searches: 3 },
      { month: '2026-04', searchRank: null, searches: 5 },
      { month: '2026-05', searchRank: null, searches: 6 },
      { month: '2026-06', searchRank: null, searches: 7 },
      { month: '2026-07', searchRank: null, searches: 8 },
      { month: '2026-08', searchRank: null, searches: 9 },
      { month: '2026-09', searchRank: null, searches: 10 },
      { month: '2026-10', searchRank: null, searches: 11 },
      { month: '2026-11', searchRank: null, searches: 12 },
    ])
    expect(result.kind).toBe('line')
    if (result.kind !== 'line') return
    expect(result.sampleCount).toBe(12)
    expect(result.pointCount).toBe(12)
    expect(result.segments[0]?.map((point) => point.month)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
    ])
  })

  it('does not count duplicate months as separate samples', () => {
    const result = describeKeywordTrend([
      { month: '2026-01', searchRank: null, searches: 100 },
      { month: '2026-01', searchRank: null, searches: 101 },
      { month: '2026-02', searchRank: null, searches: 110 },
      { month: '2026-03', searchRank: null, searches: 120 },
      { month: '2026-04', searchRank: null, searches: 130 },
      { month: '2026-05', searchRank: null, searches: 140 },
    ])
    expect(result).toEqual({ kind: 'insufficient', sampleCount: 5 })
  })

  it('returns unavailable when no trend is supplied', () => {
    expect(describeKeywordTrend(null)).toEqual({ kind: 'unavailable' })
    expect(describeKeywordTrend([])).toEqual({ kind: 'unavailable' })
  })
})

describe('keyword position summary', () => {
  it('counts the same item for natural and ad rankings when both exist', () => {
    expect(describeKeywordPositionSummary(data([
      item({ natural: { page: 1, rank: 2 }, ad: { page: 1, rank: 4 }, positionTypes: ['NT', 'ADS'] }),
      item({ keywords: 'desk stand', ad: { page: 2, rank: 9 }, positionTypes: ['ADS'] }),
      item({ keywords: 'lamp', natural: { page: 1, rank: 12 }, positionTypes: ['NT'] }),
    ]))).toEqual({
      totalKeywords: 3,
      rankedKeywords: 2,
      adKeywords: 2,
      sourceTypeCounts: [
        { code: 'NT', label: '自然搜索词', count: 2 },
        { code: 'ADS', label: 'SP广告词', count: 2 },
      ],
    })
  })

  it('deduplicates repeated source codes within one keyword', () => {
    expect(describeKeywordPositionSummary(data([
      item({ positionTypes: ['ADS', 'ADS', 'SOMETHING_NEW'] }),
    ]))).toEqual({
      totalKeywords: 1,
      rankedKeywords: 0,
      adKeywords: 0,
      sourceTypeCounts: [
        { code: 'ADS', label: 'SP广告词', count: 1 },
        { code: 'SOMETHING_NEW', label: 'SOMETHING_NEW', count: 1 },
      ],
    })
  })

  it('returns an empty source list when no items are available', () => {
    expect(describeKeywordPositionSummary(data([]))).toEqual({
      totalKeywords: 0,
      rankedKeywords: 0,
      adKeywords: 0,
      sourceTypeCounts: [],
    })
  })

  it('does not count a position whose page is known but rank is missing', () => {
    expect(describeKeywordPositionSummary(data([
      item({ natural: { page: 2, rank: null }, ad: { page: 1, rank: null } }),
    ]))).toEqual({
      totalKeywords: 1,
      rankedKeywords: 0,
      adKeywords: 0,
      sourceTypeCounts: [],
    })
  })
})
describe('position type labels', () => {
  it('covers the codes the response actually carries', () => {
    expect(POSITION_TYPE_LABELS.NT).toBe('自然搜索词')
    expect(POSITION_TYPE_LABELS.SPONSOR_BRAND).toBe('品牌广告词')
    expect(POSITION_TYPE_LABELS.SPONSOR_VIDEO).toBe('视频广告词')
    expect(POSITION_TYPE_LABELS.ADS).toBe('SP广告词')
  })
})
