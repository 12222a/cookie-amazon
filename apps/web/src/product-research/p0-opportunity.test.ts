import { describe, expect, it } from 'vitest'
import {
  buildP0ProductSelectionInput,
  buildP0ReviewCommentsInput,
  decideP0Candidate,
  rankP0Candidates,
  summarizeP0Reviews,
} from './p0-opportunity'

const product = (overrides: Record<string, unknown> = {}) => ({
  asin: 'B000000001', title: 'Example', brand: 'Brand', imageUrl: null, price: 19.99,
  rating: 4.3, reviews: 120, estimatedSales: 260, availableDate: null, availableDays: 200,
  salesGrowth: 12, salesGrowthYoy: 5, revenue: 5197, bsrRank: 20000, sellers: 1,
  categoryName: 'Home', nodeLabelPath: 'Home:Example', ...overrides,
})

describe('P0 opportunity flow', () => {
  it('builds the observed category selection and review request contracts', () => {
    expect(buildP0ProductSelectionInput('US', '2619525011')).toEqual({
      market: 'US', page: 1, size: 60, symbolFlag: false, monthName: 'bsr_sales_nearly',
      selectType: '2', filterSub: false, weightUnit: 'g',
      order: { field: 'total_units', desc: true }, productTags: [], nodeIdPaths: ['2619525011'],
      sellerTypes: [], eligibility: [], pkgDimensionTypeList: [], sellerNationList: [],
      minRanking: '10000', maxRanking: '50000', maxSales: '300', maxPrice: '30',
      maxSellers: '1', lowPrice: 'N',
    })
    expect(buildP0ReviewCommentsInput('B08H26Z7D9', 'US')).toEqual({
      asin: 'B08H26Z7D9', keyword: '', market: 'US', pageNum: 1, pageSize: 20,
      reviewEndTime: null, reviewStartTime: null, order: { fieldName: 'date', sort: 1 },
      starList: [], typeList: [], variations: [],
    })
  })

  it('limits review candidates and ranks stronger demand with lower barriers first', () => {
    const ranked = rankP0Candidates([
      product({ asin: 'B000000001' }),
      product({ asin: 'B000000002', estimatedSales: 40, reviews: 2500, salesGrowth: -10, sellers: 6 }),
      product({ asin: 'B000000003', estimatedSales: 180, reviews: 300 }),
      product({ asin: 'B000000004', estimatedSales: 160, reviews: 400 }),
    ])
    expect(ranked).toHaveLength(3)
    expect(ranked[0]?.asin).toBe('B000000001')
    expect(ranked.map((item) => item.asin)).not.toContain('B000000002')
  })

  it('summarizes low-star pain points and keeps profit limitations explicit', () => {
    const summary = summarizeP0Reviews({
      page: 1, size: 20, total: 207, took: 0,
      items: [
        { id: '1', asin: 'B000000001', parent: null, date: 1, title: 'Bad shape', titleCn: '形状差', content: 'Sagging', contentCn: '装入物品后下垂', star: 2, skus: [], likes: 3, images: [], verified: true, vine: false },
        { id: '2', asin: 'B000000001', parent: null, date: 2, title: 'Good', titleCn: null, content: 'Works', contentCn: null, star: 5, skus: [], likes: 0, images: [], verified: true, vine: false },
      ],
    })
    expect(summary).toMatchObject({ sampled: 2, total: 207, lowStarCount: 1, lowStarShare: 0.5 })
    expect(summary.painPoints).toEqual(['装入物品后下垂'])
    const candidate = rankP0Candidates([product()])[0]!
    const decision = decideP0Candidate(candidate, summary)
    expect(decision.label).toBe('继续验证')
    expect(decision.missing[0]).toContain('不能判断真实利润')
  })
})