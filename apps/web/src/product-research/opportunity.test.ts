import { describe, expect, it } from 'vitest'
import type { ProductObservation } from '@cookie-amazon/analytics'
import { buildOpportunityReport, enrichProducts, opportunityProductsToCsv } from './opportunity'

const products: ProductObservation[] = [
  { asin: 'B000000001', title: 'Wireless Charging Stand', brand: 'Northstar', imageUrl: null, price: 30, rating: 4.7, reviews: 2400, estimatedSales: 1000 },
  { asin: 'B000000002', title: 'Braided USB Cable', brand: 'Loop', imageUrl: null, price: 10, rating: 4.2, reviews: 2200, estimatedSales: 3000 },
]

describe('opportunity analytics', () => {
  it('derives revenue, category and bounded opportunity score', () => {
    const enriched = enrichProducts(products)
    expect(enriched[0]).toMatchObject({ category: '电子配件', monthlyRevenue: 30_000, source: 'v3-api' })
    expect(enriched.every((product) => (product.opportunity ?? 0) >= 0 && (product.opportunity ?? 0) <= 99)).toBe(true)
  })

  it('builds a report with distribution and risk signals', () => {
    const report = buildOpportunityReport(enrichProducts(products))
    expect(report.total).toBe(2)
    expect(report.averageSales).toBe(2000)
    expect(report.distribution.reduce((sum, item) => sum + item.count, 0)).toBe(2)
    expect(report.risks.length).toBeGreaterThan(0)
  })

  it('exports a stable CSV with escaped titles', () => {
    const csv = opportunityProductsToCsv(enrichProducts([{ ...products[0], title: 'Stand, fast' }]))
    expect(csv.split('\n')[0]).toContain('ASIN,标题,类目')
    expect(csv).toContain('"Stand, fast"')
    expect(csv).toContain('v3-api')
  })
})