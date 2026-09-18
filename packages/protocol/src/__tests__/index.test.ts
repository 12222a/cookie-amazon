import { describe, expect, it } from 'vitest'
import {
  createPingRequest,
  createSellerSpriteCompetitorRequest,
  createSellerSpriteHtmlSessionRequest,
  createSellerSpriteKeywordMiningRequest,
  createSellerSpriteKeywordReverseRequest,
  createSellerSpriteMonthlyRequest,
  createSellerSpriteMarketResearchRequest,
  createSellerSpriteAbaPeriodsRequest,
  createSellerSpriteAbaResearchRequest,
  getSellerSpriteMarketResearchMonths,
  isSellerSpriteMarketResearchMonth,
  isSellerSpriteNewReleaseMonths,
  createSellerSpriteProductSelectionRequest,
  createSellerSpriteCategoryNodesRequest,
  createSellerSpriteReviewCommentsRequest,
  isAllowedWebOrigin,
  isPingRequest,
  isPingResponse,
  isSellerSpriteCompetitorRequest,
  isSellerSpriteCompetitorResponse,
  isSellerSpriteHtmlSessionRequest,
  isSellerSpriteHtmlSessionResponse,
  isSellerSpriteKeywordMiningRequest,
  isSellerSpriteKeywordMiningResponse,
  isSellerSpriteKeywordReverseRequest,
  isSellerSpriteKeywordReverseResponse,
  isSellerSpriteMonthlyRequest,
  isSellerSpriteMonthlyResponse,
  isSellerSpriteMarketResearchRequest,
  isSellerSpriteMarketResearchResponse,
  isSellerSpriteAbaPeriodsRequest,
  isSellerSpriteAbaPeriodsResponse,
  isSellerSpriteAbaResearchRequest,
  isSellerSpriteAbaResearchResponse,
  isSellerSpriteProductSelectionRequest,
  isSellerSpriteProductSelectionResponse,
  isSellerSpriteCategoryNodesRequest,
  isSellerSpriteCategoryNodesResponse,
  isSellerSpriteReviewCommentsRequest,
  isSellerSpriteReviewCommentsResponse,
  createTargetRequest,
  isTargetRequest,
  isTargetResponse,
} from '../index'

const competitorInput = {
  asins: [], keywords: 'wireless charger', brand: '', seller: '', lowPrice: 'N' as const,
  market: 'US', monthName: 'bsr_sales_nearly', nodeIdPaths: [],
  order: { desc: true, field: 'amz_unit' }, page: 1, size: 20, symbolFlag: false,
}

const productSelectionInput = {
  eligibility: [], filterSub: false, lowPrice: 'N' as const, market: 'US', monthName: 'bsr_sales_nearly',
  nodeIdPaths: ['2619525011'], order: { desc: true, field: 'total_units' }, page: 1, pkgDimensionTypeList: [],
  productTags: [], selectType: '2' as const, sellerNationList: [], sellerTypes: [], size: 60,
  symbolFlag: false, weightUnit: 'g' as const, minRanking: '10000', maxRanking: '50000',
  maxSales: '300', maxPrice: '30', maxSellers: '1',
}

const keywordMiningInput = {
  amazonChoice: false, desc: true, filterRootWord: 0, historyDate: '',
  keyword: 'phone stand', keywordBidMatchType: 'exact', market: 1, matchType: 0,
  orderBy: 21, pageNum: 1, pageSize: 50,
}

describe('protocol', () => {
  it('accepts a valid PING request', () => {
    expect(isPingRequest(createPingRequest('request-1'))).toBe(true)
  })

  it('rejects unknown actions and origins while allowing local development hosts', () => {
    expect(isPingRequest({ ...createPingRequest('request-1'), action: 'FETCH' })).toBe(false)
    expect(isAllowedWebOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedWebOrigin('http://127.0.0.1:5173')).toBe(true)
    expect(isAllowedWebOrigin('https://attacker.example')).toBe(false)
  })

  it('accepts a successful response', () => {
    expect(isPingResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-1', ok: true,
      data: { connected: true, extensionVersion: '0.1.0', protocolVersion: 1, capabilities: ['PING'] },
    })).toBe(true)
  })

  it('validates targetId-only requests and responses', () => {
    const request = createTargetRequest('GET_TARGET_STATUS', 'request-2', 'example')
    expect(isTargetRequest(request)).toBe(true)
    expect(isTargetRequest({ ...request, payload: { targetId: 'example', origin: 'https://evil.example' } })).toBe(false)
    expect(isTargetRequest(createTargetRequest('LIST_TARGETS', 'request-3'))).toBe(true)
    expect(isTargetRequest({ ...createTargetRequest('LIST_TARGETS', 'request-3'), payload: { targetId: 'example' } })).toBe(false)
    expect(isTargetResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-2', action: 'GET_TARGET_STATUS', ok: true,
      data: {
        targetId: 'example', displayName: 'Example', origin: 'https://example.com',
        enabled: true, status: 'permission-required', granted: false,
        capabilities: ['CHECK_LOGIN', 'GET_PROFILE'],
      },
    })).toBe(true)
    expect(isTargetResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-4', action: 'CHECK_LOGIN', ok: true,
      data: { targetId: 'example', loggedIn: false },
    })).toBe(true)
    expect(isTargetResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-5', action: 'GET_PROFILE', ok: true,
      data: { targetId: 'example', profile: { userId: 'user-1', displayName: 'Example User' } },
    })).toBe(true)
    expect(isTargetResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-6', action: 'GET_PROFILE', ok: true,
      data: { targetId: 'example', profile: { userId: 'user-1', displayName: 'Example User', token: 'secret' } },
    })).toBe(false)
  })

  it('validates keyword reverse allowlists and minimized responses', () => {
    const input = {
      asin: 'B000000000', marketId: 1, month: '', forceReStat: false, badges: [], limit: 20,
    }
    const request = createSellerSpriteKeywordReverseRequest('request-7', 'sellersprite', input)
    expect(isSellerSpriteKeywordReverseRequest(request)).toBe(true)
    expect(isSellerSpriteKeywordReverseRequest({
      ...request,
      payload: { ...request.payload, input: { ...input, unexpected: true } },
    })).toBe(false)
    expect(isSellerSpriteKeywordReverseRequest({
      ...request,
      payload: { ...request.payload, input: { ...input, badges: [{ secret: true }] } },
    })).toBe(false)
    expect(isSellerSpriteKeywordReverseRequest({
      ...request,
      payload: { ...request.payload, input: { ...input, badges: [null, true, 1, 'organic'] } },
    })).toBe(true)

    expect(isSellerSpriteKeywordReverseResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-7', action: 'SELLERSPRITE_KEYWORD_REVERSE', ok: true,
      data: {
        asin: 'B000000000',
        total: 1,
        items: [{
          keywords: 'example', searches: 100, products: null, supplyDemandRatio: 1,
          trafficPercentage: 0.5, purchaseRate: null, bid: 1.2, bidMin: null,
          bidMax: 2, avgPrice: 20, avgRating: null, avgReviews: 10,
          searchesTrend: [{ month: '2026-01', searchRank: null, searches: 100 }],
          natural: { page: 1, rank: 6 },
          ad: null,
          naturalRatio: 0.76,
          adRatio: null,
          positionTypes: ['NT'],
        }],
      },
    })).toBe(true)

    const errorResponse = {
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-7', action: 'SELLERSPRITE_KEYWORD_REVERSE', ok: false,
      error: {
        code: 'TARGET_API_ERROR', httpStatus: 400,
        targetCode: 'INVALID_ASIN', targetMessage: 'ASIN 参数无效',
      },
    }
    expect(isSellerSpriteKeywordReverseResponse(errorResponse)).toBe(true)
    expect(isSellerSpriteKeywordReverseResponse({
      ...errorResponse, error: { ...errorResponse.error, httpStatus: 99 },
    })).toBe(false)
    expect(isSellerSpriteKeywordReverseResponse({
      ...errorResponse, error: { ...errorResponse.error, targetMessage: 'x'.repeat(513) },
    })).toBe(false)
  })

  it('validates monthly query inputs and minimized variation snapshots', () => {
    const input = { asin: 'B000000000', month: '', station: 'US' }
    const request = createSellerSpriteMonthlyRequest('request-monthly', 'sellersprite', input)
    expect(isSellerSpriteMonthlyRequest(request)).toBe(true)
    expect(isSellerSpriteMonthlyRequest({
      ...request, payload: { ...request.payload, input: { ...input, token: 'secret' } },
    })).toBe(false)
    expect(isSellerSpriteMonthlyResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-monthly', action: 'SELLERSPRITE_MONTHLY', ok: true,
      data: {
        historyStatus: 'not-verified',
        variations: [{
          asin: 'B000000000', availableDate: 1_700_000_000_000, availableDays: 120,
          bsrLabel: 'Electronics', bsrRank: 1234, currency: '$', price: 29.99,
          rating: 4.5, reviews: 321, reviewsRate: 0.03, station: 'US', title: 'Example',
        }],
      },
    })).toBe(true)
  })

  it('validates competitor lookup allowlists and paginated responses', () => {
    const request = createSellerSpriteCompetitorRequest('request-competitor', 'sellersprite', competitorInput)
    expect(isSellerSpriteCompetitorRequest(request)).toBe(true)
    expect(isSellerSpriteCompetitorRequest({
      ...request,
      payload: { ...request.payload, input: { ...competitorInput, unexpected: true } },
    })).toBe(false)
    expect(isSellerSpriteCompetitorRequest({
      ...request,
      payload: { ...request.payload, input: { ...competitorInput, keywords: '' } },
    })).toBe(false)

    expect(isSellerSpriteCompetitorResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-competitor', action: 'COMPETITOR_RESEARCH', ok: true,
      data: {
        items: [{
          asin: 'B000000000', title: 'Example', brand: null, imageUrl: null,
          price: 20, rating: 4.5, reviews: 10, estimatedSales: 100,
          availableDate: 1_700_000_000_000, availableDays: 120,
        }],
        page: 1, pages: 1, size: 20, total: 1, hasNextPage: false,
      },
    })).toBe(true)
  })

  it('validates product selection allowlists and paginated responses', () => {
    const request = createSellerSpriteProductSelectionRequest('request-8', 'sellersprite', productSelectionInput)
    expect(isSellerSpriteProductSelectionRequest(request)).toBe(true)
    expect(isSellerSpriteProductSelectionRequest({
      ...request,
      payload: {
        ...request.payload,
        input: { ...productSelectionInput, keyword: 'wireless charger', lowPrice: '', monthName: '' },
      },
    })).toBe(false)
    expect(isSellerSpriteProductSelectionRequest({
      ...request,
      payload: { ...request.payload, input: { ...productSelectionInput, keyword: '无线充电器' } },
    })).toBe(false)
    expect(isSellerSpriteProductSelectionRequest({
      ...request,
      payload: { ...request.payload, input: { ...productSelectionInput, unexpected: true } },
    })).toBe(false)
    expect(isSellerSpriteProductSelectionRequest({
      ...request,
      payload: { ...request.payload, input: { ...productSelectionInput, nodeIdPaths: [{ secret: true }] } },
    })).toBe(false)
    expect(isSellerSpriteProductSelectionRequest({
      ...request,
      payload: { ...request.payload, input: { ...productSelectionInput, order: { desc: true } } },
    })).toBe(false)

    expect(isSellerSpriteProductSelectionResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-8', action: 'PRODUCT_SELECTION', ok: true,
      data: {
        page: 1, pages: 5, size: 20, total: 100, hasNextPage: true,
        items: [{
          asin: 'B000000000', title: 'Example', brand: null, imageUrl: null,
          price: 20, rating: null, reviews: 10, estimatedSales: null,
          availableDate: null, availableDays: null, salesGrowth: null, salesGrowthYoy: null,
          revenue: null, bsrRank: null, sellers: null, categoryName: null, nodeLabelPath: null,
        }],
      },
    })).toBe(true)
    expect(isSellerSpriteProductSelectionResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-8', action: 'PRODUCT_SELECTION', ok: true,
      data: {
        page: 1, pages: 5, size: 20, total: 100, hasNextPage: true,
        items: [{ asin: 'B000000000', title: 'Example', brand: null, imageUrl: null, price: 20, rating: null, reviews: 10, estimatedSales: null, leak: 'x' }],
      },
    })).toBe(false)
  })

  it('validates category nodes and review comment allowlists', () => {
    const categoryRequest = createSellerSpriteCategoryNodesRequest('category-1', 'sellersprite', {
      marketld: 1, table: 'bsr_sales_nearly',
    })
    expect(isSellerSpriteCategoryNodesRequest(categoryRequest)).toBe(true)
    expect(isSellerSpriteCategoryNodesRequest({
      ...categoryRequest,
      payload: { ...categoryRequest.payload, input: { marketId: 1, table: 'bsr_sales_nearly' } },
    })).toBe(false)
    expect(isSellerSpriteCategoryNodesResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'category-1', action: 'SELLERSPRITE_CATEGORY_NODES', ok: true,
      data: { parent: null, items: [{ id: '2619525011', label: 'Appliances', labelLocale: '家电', products: 83290, children: 7 }] },
    })).toBe(true)

    const reviewInput = {
      asin: 'B08H26Z7D9', keyword: '' as const, market: 'US', pageNum: 1, pageSize: 20,
      reviewEndTime: null, reviewStartTime: null, order: { fieldName: 'date' as const, sort: 1 as const },
      starList: [], typeList: [], variations: [],
    }
    const reviewRequest = createSellerSpriteReviewCommentsRequest('review-1', 'sellersprite', reviewInput)
    expect(isSellerSpriteReviewCommentsRequest(reviewRequest)).toBe(true)
    expect(isSellerSpriteReviewCommentsRequest({
      ...reviewRequest, payload: { ...reviewRequest.payload, input: { ...reviewInput, unexpectedField: 'blocked' } },
    })).toBe(false)
    expect(isSellerSpriteReviewCommentsResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'review-1', action: 'SELLERSPRITE_REVIEW_COMMENTS', ok: true,
      data: {
        page: 1, size: 20, total: 207, took: 0,
        items: [{
          id: 'USR1', asin: 'B08H26Z7D9', parent: 'B0FH9C8V7Y', date: 1782748800000,
          title: 'Worth it', titleCn: '值得', content: 'Works well', contentCn: '很好用',
          star: 5, skus: ['Color: Ivory'], likes: 0, images: [], verified: true, vine: false,
        }],
      },
    })).toBe(true)
  })

  it('validates keyword mining allowlists and only accepts observed empty results', () => {
    const request = createSellerSpriteKeywordMiningRequest('request-9', 'sellersprite', keywordMiningInput)
    expect(isSellerSpriteKeywordMiningRequest(request)).toBe(true)
    expect(isSellerSpriteKeywordMiningRequest({
      ...request,
      payload: { ...request.payload, input: { ...keywordMiningInput, unexpected: 1 } },
    })).toBe(false)
    expect(isSellerSpriteKeywordMiningRequest({
      ...request,
      payload: { ...request.payload, input: { ...keywordMiningInput, pageSize: 0 } },
    })).toBe(false)

    expect(isSellerSpriteKeywordMiningResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-9', action: 'KEYWORD_MINING', ok: true,
      data: { items: [], page: 1, size: 20, took: 12, total: 0 },
    })).toBe(true)
    expect(isSellerSpriteKeywordMiningResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-9', action: 'KEYWORD_MINING', ok: true,
      data: { items: [{ keyword: 'x' }], page: 1, size: 20, took: 12, total: 1 },
    })).toBe(false)
  })

  it('validates the strict market research request and minimized HTML-derived response', () => {
    const input = {
      marketId: 1 as const,
      departmentKeyword: 'phone stand',
      monthName: 'bsr_sales_nearly' as const,
      newReleaseNum: 6 as const,
    }
    const request = createSellerSpriteMarketResearchRequest('request-market', 'sellersprite', input)
    expect(isSellerSpriteMarketResearchRequest(request)).toBe(true)
    expect(isSellerSpriteMarketResearchRequest({
      ...request, payload: { ...request.payload, input: { ...input, token: 'secret' } },
    })).toBe(false)
    expect(isSellerSpriteMarketResearchRequest({
      ...request, payload: { ...request.payload, input: { ...input, marketId: 2 } },
    })).toBe(false)
    expect(isSellerSpriteMarketResearchRequest({
      ...request, payload: { ...request.payload, input: { ...input, monthName: 'bsr_sales_monthly_199901' } },
    })).toBe(false)
    expect(isSellerSpriteMarketResearchRequest({
      ...request, payload: { ...request.payload, input: { ...input, newReleaseNum: 9 } },
    })).toBe(false)
    expect(getSellerSpriteMarketResearchMonths(new Date(2026, 7, 17))).toEqual([
      'bsr_sales_nearly',
      'bsr_sales_monthly_202607', 'bsr_sales_monthly_202606', 'bsr_sales_monthly_202605',
      'bsr_sales_monthly_202604', 'bsr_sales_monthly_202603', 'bsr_sales_monthly_202602',
      'bsr_sales_monthly_202601', 'bsr_sales_monthly_202512', 'bsr_sales_monthly_202511',
      'bsr_sales_monthly_202510', 'bsr_sales_monthly_202509', 'bsr_sales_monthly_202508',
      'bsr_sales_monthly_202507',
    ])
    expect(isSellerSpriteMarketResearchMonth('bsr_sales_monthly_202507', new Date(2026, 7, 17))).toBe(true)
    expect(isSellerSpriteMarketResearchMonth('bsr_sales_monthly_202506', new Date(2026, 7, 17))).toBe(false)
    expect(isSellerSpriteNewReleaseMonths(12)).toBe(true)
    expect(isSellerSpriteNewReleaseMonths(9)).toBe(false)

    const row = {
      marketName: 'Telephone Stands', sampleProducts: 24, sampleBrands: 19, sampleSellers: 21,
      totalSales: 20699, averageSales: 862, headSales: 2044, averageRevenue: 10875,
      headRevenue: 22525, averageReviews: 1787, averageRating: 4.3, averageBsr: 196138,
      headBsr: 89900, averageSellers: 3.8, averagePrice: 70.85, fbaRatio: 0.54,
      amzRatio: 0.04, fbmRatio: 0.31, productConcentration: 0.988,
      brandConcentration: 0.992, sellerConcentration: 0.992, newProductCount: 7,
      newProductRatio: 0.2917, totalProducts: 124, profit: null,
    }
    const fieldCoverage = {
      sampleCounts: 1, totalSales: 1, averageSales: 1, averageRevenue: 1, rating: 1,
      bsr: 1, price: 1, sellerTypes: 1, concentration: 1, newProducts: 1,
      totalProducts: 1, profit: 0 as const,
    }
    const response = {
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-market', action: 'SELLERSPRITE_MARKET_RESEARCH', ok: true,
      data: { rows: [row], fieldCoverage, profitStatus: 'not-integrated' },
    }
    expect(isSellerSpriteMarketResearchResponse(response)).toBe(true)
    expect(isSellerSpriteMarketResearchResponse({
      ...response, data: { ...response.data, html: '<html />' },
    })).toBe(false)
    expect(isSellerSpriteMarketResearchResponse({
      ...response, data: { ...response.data, rows: [{ ...row, profit: 12 }] },
    })).toBe(false)
  })

  it('validates ABA periods, weekly/monthly inputs, and minimized rows', () => {
    const periodsRequest = createSellerSpriteAbaPeriodsRequest('request-aba-periods', 'sellersprite')
    expect(isSellerSpriteAbaPeriodsRequest(periodsRequest)).toBe(true)
    expect(isSellerSpriteAbaPeriodsRequest({
      ...periodsRequest, payload: { targetId: 'sellersprite', extra: true },
    })).toBe(false)
    expect(isSellerSpriteAbaPeriodsResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-aba-periods', action: 'SELLERSPRITE_ABA_PERIODS', ok: true,
      data: {
        weekTables: [{ table: 'ara_20260815', label: '20260815' }],
        monthTables: [{ table: 'ara_202607', label: '202607' }],
      },
    })).toBe(true)

    const input = {
      reverseType: 'M' as const, table: 'ara_202607', q: 'screen protector',
      market: 'COM' as const, page: 2, size: 50,
    }
    const request = createSellerSpriteAbaResearchRequest('request-aba', 'sellersprite', input)
    expect(isSellerSpriteAbaResearchRequest(request)).toBe(true)
    expect(isSellerSpriteAbaResearchRequest({
      ...request, payload: { ...request.payload, input: { ...input, table: 'ara_20260815' } },
    })).toBe(false)
    expect(isSellerSpriteAbaResearchRequest({
      ...request, payload: { ...request.payload, input: { ...input, page: 0 } },
    })).toBe(false)
    expect(isSellerSpriteAbaResearchRequest({
      ...request, payload: { ...request.payload, input: { ...input, rankGrowthType: 'W1' } },
    })).toBe(false)

    const item = {
      keyword: 'iphone screen protector', keywordCn: '手机膜', keywordJp: null,
      searches: 185231, clicks: 81473, impressions: 4464850, purchaseRate: 0.0073,
      purchases: 1352, products: 6057, departments: ['Cell Phones & Accessories'],
      searchRank: 354, searchRankGrowthValue: 4, searchRankGrowthRate: 0.0112,
      cvsShareRate: 0.3193, clickShareRate: 0.3423,
    }
    const response = {
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-aba', action: 'SELLERSPRITE_ABA_RESEARCH', ok: true,
      data: { page: 2, pages: 90, size: 50, total: 4490, took: 46, hasNextPage: true, items: [item] },
    }
    expect(isSellerSpriteAbaResearchResponse(response)).toBe(true)
    expect(isSellerSpriteAbaResearchResponse({
      ...response, data: { ...response.data, items: [{ ...item, gkDatas: [{ asin: 'secret' }] }] },
    })).toBe(false)
  })

  it('validates HTML session requests and minimized status responses', () => {
    const request = createSellerSpriteHtmlSessionRequest('MARKET_SELECTION', 'request-10', 'sellersprite')
    expect(isSellerSpriteHtmlSessionRequest(request)).toBe(true)
    expect(isSellerSpriteHtmlSessionRequest({
      ...request,
      payload: { targetId: 'sellersprite', extra: true },
    })).toBe(false)
    expect(isSellerSpriteHtmlSessionRequest({ ...request, action: 'UNKNOWN' })).toBe(false)

    expect(isSellerSpriteHtmlSessionResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-10', action: 'KEYWORD_PRODUCT_RESEARCH', ok: true,
      data: { targetId: 'sellersprite', completed: true },
    })).toBe(true)
    expect(isSellerSpriteHtmlSessionResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-10', action: 'MARKET_SELECTION', ok: true,
      data: { targetId: 'sellersprite', completed: true, body: '<html/>' },
    })).toBe(false)
  })
})