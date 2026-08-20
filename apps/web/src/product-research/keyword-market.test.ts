import { describe, expect, it } from 'vitest'
import type { SellerSpriteKeywordItem } from '@cookie-amazon/protocol'
import { buildKeywordMarketReport } from './keyword-market'

const keyword = (
  keywords: string,
  searches: number,
  products: number,
  trend: readonly number[],
): SellerSpriteKeywordItem => ({
  keywords,
  searches,
  products,
  supplyDemandRatio: products / searches,
  trafficPercentage: 0.1,
  purchaseRate: 0.04,
  bid: 1,
  bidMin: 0.8,
  bidMax: 1.2,
  avgPrice: 25,
  avgRating: 4.4,
  avgReviews: 500,
  searchesTrend: trend.map((value, index) => ({ month: `20260${index + 1}`, searches: value, searchRank: null })),
})

describe('keyword market analytics', () => {
  it('deduplicates ASIN keywords and derives demand evidence', () => {
    const shared = keyword('wireless charging stand', 20_000, 2_000, [100, 100, 100, 140, 150, 160])
    const report = buildKeywordMarketReport([
      { asin: 'B000000001', data: { asin: 'B000000001', total: 80, items: [shared, keyword('fast charging station', 10_000, 800, [80, 80, 80, 90, 100, 110])] } },
      { asin: 'B000000002', data: { asin: 'B000000002', total: 60, items: [shared, keyword('wireless charger desk', 8_000, 500, [70, 70, 70, 65, 75, 80])] } },
    ])

    expect(report.analyzedAsinCount).toBe(2)
    expect(report.availableKeywordCount).toBe(140)
    expect(report.sampledKeywordCount).toBe(4)
    expect(report.uniqueKeywordCount).toBe(3)
    expect(report.uniqueSearchVolume).toBe(38_000)
    expect(report.searchTrendGrowth).toBeGreaterThan(0)
    expect(report.maximumTrendMonths).toBe(6)
    expect(report.demandScore).not.toBeNull()
    expect(report.demandConfidence).toBeGreaterThan(0)
  })

  it('creates deterministic lexical niches without claiming semantic review insights', () => {
    const report = buildKeywordMarketReport([{
      asin: 'B000000001',
      data: {
        asin: 'B000000001',
        total: 3,
        items: [
          keyword('wireless charging stand', 20_000, 2_000, [1, 1, 1, 2, 2, 2]),
          keyword('wireless charger desk', 8_000, 500, [1, 1, 1, 1, 1, 1]),
          keyword('portable power bank', 15_000, 1_000, [1, 1, 1, 1, 1, 1]),
        ],
      },
    }])

    expect(report.niches).toHaveLength(2)
    expect(report.niches[0].keywords.length).toBeGreaterThan(0)
    expect(report.niches.flatMap((niche) => niche.keywords)).toContain('portable power bank')
  })
})