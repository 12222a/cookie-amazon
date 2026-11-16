import { describe, expect, it } from 'vitest'
import type { SellerSpriteKeywordReverseData } from '@cookie-amazon/protocol'
import { analyzeSellerSpriteAsinAdStructure } from './ad-analysis.js'

describe('analyzeSellerSpriteAsinAdStructure', () => {
  it('summarizes ad positions and averages only reported ratios', () => {
    const data: SellerSpriteKeywordReverseData = {
      asin: 'B000000000',
      total: 3,
      items: [
        { keywords: 'hybrid', searches: 100, products: null, supplyDemandRatio: null, trafficPercentage: null, purchaseRate: null, bid: null, bidMin: null, bidMax: null, avgPrice: null, avgRating: null, avgReviews: null, searchesTrend: null, natural: { page: 1, rank: 5 }, ad: { page: 1, rank: 2 }, naturalRatio: 0.7, adRatio: 0.3, positionTypes: ['NT', 'ADS'] },
        { keywords: 'ad only', searches: null, products: null, supplyDemandRatio: null, trafficPercentage: null, purchaseRate: null, bid: null, bidMin: null, bidMax: null, avgPrice: null, avgRating: null, avgReviews: null, searchesTrend: null, natural: null, ad: { page: 2, rank: 30 }, naturalRatio: null, adRatio: 0.6, positionTypes: ['ADS'] },
        { keywords: 'organic only', searches: 50, products: null, supplyDemandRatio: null, trafficPercentage: null, purchaseRate: null, bid: null, bidMin: null, bidMax: null, avgPrice: null, avgRating: null, avgReviews: null, searchesTrend: null, natural: { page: 1, rank: 9 }, ad: null, naturalRatio: 0.8, adRatio: null, positionTypes: ['NT'] },
      ],
    }

    const result = analyzeSellerSpriteAsinAdStructure(data)
    expect(result).toMatchObject({
      totalKeywords: 3,
      analyzedKeywords: 3,
      keywordsWithAdPosition: 2,
      adPositionCoverage: 2 / 3,
      keywordsWithNaturalPosition: 2,
      naturalPositionCoverage: 2 / 3,
      keywordsWithBothPositions: 1,
      keywordsWithAdRatio: 2,
      keywordsWithNaturalRatio: 2,
      meanObservedNaturalRatio: 0.75,
      topAdKeywords: [{ keywords: 'ad only' }, { keywords: 'hybrid' }],
    })
    expect(result.meanObservedAdRatio).toBeCloseTo(0.45)
  })

  it('returns null means and an empty ad list when the source has no ad data', () => {
    const result = analyzeSellerSpriteAsinAdStructure({ asin: 'B000000000', total: 0, items: [] })
    expect(result.meanObservedAdRatio).toBeNull()
    expect(result.meanObservedNaturalRatio).toBeNull()
    expect(result.adPositionCoverage).toBeNull()
    expect(result.naturalPositionCoverage).toBeNull()
    expect(result.topAdKeywords).toEqual([])
  })
})
