import { describe, expect, it } from 'vitest'
import type { ProductObservation } from '@cookie-amazon/analytics'
import { buildOpportunityReport, enrichProducts, opportunityProductsToCsv } from './opportunity'

const products: ProductObservation[] = [
  { asin: 'B000000001', title: 'Wireless Charging Stand', brand: 'Northstar', imageUrl: null, price: 30, rating: 4.7, reviews: 2400, estimatedSales: 1000 },
  { asin: 'B000000002', title: 'Braided USB Cable', brand: 'Loop', imageUrl: null, price: 10, rating: 4.2, reviews: 2200, estimatedSales: 3000 },
  { asin: 'B000000003', title: 'Charging Pad', brand: 'Northstar', imageUrl: null, price: 24, rating: 4.4, reviews: 400, estimatedSales: 1800 },
]

describe('market opportunity analytics', () => {
  it('derives revenue, category and bounded research priority', () => {
    const enriched = enrichProducts(products)
    expect(enriched[0]).toMatchObject({ category: '电子配件', monthlyRevenue: 30_000, source: 'v3-api' })
    expect(enriched.every((product) => (product.researchPriority ?? 0) >= 0 && (product.researchPriority ?? 0) <= 100)).toBe(true)
    expect(enriched[2].researchPriority).toBeGreaterThan(enriched[0].researchPriority ?? 0)
  })

  it('builds an explainable market report from available data', () => {
    const report = buildOpportunityReport(enrichProducts(products))
    expect(report.total).toBe(3)
    expect(report.averageSales).toBeCloseTo(1933.33, 2)
    expect(report.marketMetrics.dataCompleteness).toBe(1)
    expect(report.marketConfidence).toBe(0.45)
    expect(report.marketMetrics.top3SalesShare).toBe(1)
    expect(report.marketMetrics.brandCount).toBe(2)
    expect(report.marketScore).not.toBeNull()
    expect(report.recommendation).toBe('INSUFFICIENT_DATA')
    expect(report.risks).toContain('销量高度集中在少数头部商品，新品进入难度可能较高')
    expect(report.distribution.reduce((sum, item) => sum + item.count, 0)).toBe(3)
  })

  it('does not create a confident market conclusion from incomplete products', () => {
    const report = buildOpportunityReport(enrichProducts([
      { asin: 'B000000004', title: null, brand: null, imageUrl: null, price: null, rating: null, reviews: null, estimatedSales: 100 },
    ]))
    expect(report.marketMetrics.dataCompleteness).toBe(0.25)
    expect(report.recommendation).toBe('INSUFFICIENT_DATA')
    expect(report.risks).toContain('当前数据不完整，搜索趋势、新品和评论痛点尚未纳入')
  })

  it('exports research priority with escaped titles', () => {
    const csv = opportunityProductsToCsv(enrichProducts([{ ...products[0], title: 'Stand, fast' }]))
    expect(csv.split('\n')[0]).toContain('ASIN,标题,类目')
    expect(csv.split('\n')[0]).toContain('研究优先级')
    expect(csv).toContain('"Stand, fast"')
    expect(csv).toContain('v3-api')
  })
})