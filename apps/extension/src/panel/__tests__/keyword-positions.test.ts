import { describe, expect, it } from 'vitest'
import { describeKeywordPositions, POSITION_TYPE_LABELS } from '../keyword-positions'
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
describe('position type labels', () => {
  it('covers the codes the response actually carries', () => {
    expect(POSITION_TYPE_LABELS.NT).toBe('自然搜索词')
    expect(POSITION_TYPE_LABELS.SPONSOR_BRAND).toBe('品牌广告词')
    expect(POSITION_TYPE_LABELS.SPONSOR_VIDEO).toBe('视频广告词')
    expect(POSITION_TYPE_LABELS.ADS).toBe('SP广告词')
  })
})
