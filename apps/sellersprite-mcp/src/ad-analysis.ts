import type { SellerSpriteKeywordReverseData } from '@cookie-amazon/protocol'

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length

export const analyzeSellerSpriteAsinAdStructure = (data: SellerSpriteKeywordReverseData) => {
  const adRanked = data.items.filter((item) => item.ad !== null)
  const organicRanked = data.items.filter((item) => item.natural !== null)
  const adRatios = data.items.flatMap((item) => item.adRatio === null ? [] : [item.adRatio])
  const naturalRatios = data.items.flatMap((item) => item.naturalRatio === null ? [] : [item.naturalRatio])
  const adKeywords = adRanked
    .slice()
    .sort((left, right) => (right.adRatio ?? -1) - (left.adRatio ?? -1)
      || (left.ad?.rank ?? Number.MAX_SAFE_INTEGER) - (right.ad?.rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 20)
    .map(({ keywords, searches, bid, bidMin, bidMax, ad, natural, adRatio, naturalRatio, positionTypes }) => ({
      keywords, searches, bid, bidMin, bidMax, ad, natural, adRatio, naturalRatio, positionTypes,
    }))
  const analyzedCount = data.items.length

  return {
    asin: data.asin,
    totalKeywords: data.total,
    analyzedKeywords: analyzedCount,
    keywordsWithAdPosition: adRanked.length,
    adPositionCoverage: analyzedCount === 0 ? null : adRanked.length / analyzedCount,
    keywordsWithNaturalPosition: organicRanked.length,
    naturalPositionCoverage: analyzedCount === 0 ? null : organicRanked.length / analyzedCount,
    keywordsWithBothPositions: data.items.filter((item) => item.ad !== null && item.natural !== null).length,
    keywordsWithAdRatio: adRatios.length,
    meanObservedAdRatio: mean(adRatios),
    keywordsWithNaturalRatio: naturalRatios.length,
    meanObservedNaturalRatio: mean(naturalRatios),
    topAdKeywords: adKeywords,
    interpretation: '基于 SellerSprite ASIN 关键词反查的广告位和逐关键词流量占比；覆盖率按本次返回关键词计算，占比均值是简单平均。竞价字段为关键词估值，不代表实际 CPC；本结果不代表销售额归因、ACOS 或广告活动报表。',
  }
}
