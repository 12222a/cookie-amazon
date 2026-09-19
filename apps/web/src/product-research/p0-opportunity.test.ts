import { describe, expect, it } from 'vitest'
import { SELLERSPRITE_RECORDED_LEAF_CATEGORIES } from './sellersprite-category-catalog'
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
    const leafPath = '7141123011:7586165011:14194728011:14194729011:14194730011'
    expect(buildP0ProductSelectionInput('US', leafPath)).toEqual({
      market: 'US', page: 1, size: 60, symbolFlag: false, monthName: 'bsr_sales_nearly',
      selectType: '2', filterSub: false, weightUnit: 'g',
      order: { field: 'total_units', desc: true }, nodeIdPaths: [leafPath],
      productTags: [], sellerTypes: [], eligibility: [], pkgDimensionTypeList: [], sellerNationList: [],
      minRanking: '10000', maxRanking: '50000', maxSales: '300', maxPrice: '30',
      maxSellers: '1', lowPrice: 'N',
    })
    expect(() => buildP0ProductSelectionInput('US', '2619525011')).toThrow('INVALID_LEAF_CATEGORY')
    expect(buildP0ProductSelectionInput('US', leafPath, 3).page).toBe(3)
    expect(buildP0ProductSelectionInput('US', leafPath, 1, 'expanded')).toMatchObject({
      nodeIdPaths: [leafPath], minRanking: '', maxRanking: '', maxSales: '', maxPrice: '', maxSellers: '',
    })
    expect(() => buildP0ProductSelectionInput('US', leafPath, 0)).toThrow('INVALID_PRODUCT_PAGE')
    expect(buildP0ProductSelectionInput('US', leafPath).nodeIdPaths)
      .toEqual([leafPath])
    expect(buildP0ReviewCommentsInput('B08H26Z7D9', 'US')).toEqual({
      asin: 'B08H26Z7D9', keyword: '', market: 'US', pageNum: 1, pageSize: 20,
      reviewEndTime: null, reviewStartTime: null, order: { fieldName: 'date', sort: 1 },
      starList: [], typeList: [], variations: [],
    })
  })

  it('exposes the recorded leaf category catalog with complete paths', () => {
    expect(SELLERSPRITE_RECORDED_LEAF_CATEGORIES).toHaveLength(230)
    expect(new Set(SELLERSPRITE_RECORDED_LEAF_CATEGORIES.map((item) => item.id)).size).toBe(230)
    expect(SELLERSPRITE_RECORDED_LEAF_CATEGORIES.every((item) => item.children === 0 && /^\d+(?::\d+)+$/.test(item.id))).toBe(true)
    expect(SELLERSPRITE_RECORDED_LEAF_CATEGORIES).toContainEqual(expect.objectContaining({
      id: '7141123011:7586165011:14194713011:14194723011', labelLocale: '假发', children: 0,
    }))
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