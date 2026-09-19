import { describe, expect, it } from 'vitest'
import type { SellerSpriteCompetitorData } from '@cookie-amazon/protocol'
import { buildKeywordOpportunityReport, keywordOpportunityToCsv, mergeKeywordCompetitorPages, type KeywordOpportunityInput } from './keyword-opportunity'

const input: KeywordOpportunityInput = {
  keyword: 'wireless charger',
  market: 'US',
  monthName: 'recent_30_days',
  newReleaseNum: 6,
  filters: { minPrice: 15, maxPrice: 50, minSales: 100, maxReviews: 1_000, minRating: 3.5, maxSellers: null },
}

const item = (asin: string, sales: number, reviews: number, price = 25) => ({
  asin, title: `Product ${asin}`, brand: 'Brand', imageUrl: null, price, rating: 4.2,
  reviews, estimatedSales: sales, availableDate: null, availableDays: 100,
})

const data: SellerSpriteCompetitorData = {
  page: 1, pages: 1, size: 60, total: 3, hasNextPage: false,
  items: [item('B000000001', 500, 100), item('B000000001', 500, 100), item('B000000002', 120, 900), item('B000000003', 20, 10)],
}

describe('keyword opportunity report', () => {
  it('deduplicates ASINs, applies hard filters, and keeps ranked candidates', () => {
    const report = buildKeywordOpportunityReport(data, input)
    expect(report.totalReturned).toBe(3)
    expect(report.sampledCount).toBe(4)
    expect(report.uniqueCount).toBe(3)
    expect(report.matchedCount).toBe(2)
    expect(report.candidates.map((candidate) => candidate.asin)).toEqual(['B000000001', 'B000000002'])
    expect(report.candidates[0].rank).toBe(1)
    expect(report.candidates[0].tier).toBe('A')
  })

  it('merges multiple SellerSprite pages while preserving the reported total', () => {
    const merged = mergeKeywordCompetitorPages([
      { page: 1, pages: 3, size: 60, total: 125, hasNextPage: true, items: [item('B000000001', 500, 100)] },
      { page: 2, pages: 3, size: 60, total: 125, hasNextPage: true, items: [item('B000000002', 400, 200)] },
      { page: 3, pages: 3, size: 60, total: 125, hasNextPage: false, items: [item('B000000003', 300, 300)] },
    ])

    expect(merged).toMatchObject({ page: 1, pages: 3, size: 60, total: 125, hasNextPage: false })
    expect(merged.items.map((product) => product.asin)).toEqual(['B000000001', 'B000000002', 'B000000003'])
  })

  it('keeps every matching ASIN after ranking instead of truncating at ten', () => {
    const many = Array.from({ length: 14 }, (_, index) => item(`B${String(index + 1).padStart(9, '0')}`, 1_000 - index, 100 + index))
    const report = buildKeywordOpportunityReport({
      page: 1,
      pages: 1,
      size: 60,
      total: many.length,
      hasNextPage: false,
      items: [...many, many[0]!],
    }, input)

    expect(report.matchedCount).toBe(14)
    expect(report.candidates).toHaveLength(14)
    expect(new Set(report.candidates.map((candidate) => candidate.asin)).size).toBe(14)
    expect(report.candidates.slice(0, 3).every((candidate) => candidate.evidence.reviews === 'queued')).toBe(true)
    expect(report.candidates.slice(3).every((candidate) => candidate.evidence.reviews === 'unavailable')).toBe(true)
    expect(keywordOpportunityToCsv(report, input)).toContain('B000000014')
  })

  it('exports query context, evidence boundary, and candidate fields', () => {
    const csv = keywordOpportunityToCsv(buildKeywordOpportunityReport(data, input), input)
    expect(csv).toContain('关键词,站点,统计周期')
    expect(csv).toContain('wireless charger,US')
    expect(csv).toContain('采购成本、物流、广告、税费和退货成本')
    expect(csv).toContain('未接入')
  })
})