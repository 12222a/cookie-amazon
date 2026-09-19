import { describe, expect, it, vi } from 'vitest'
import { getSellerSpriteMarketResearchMonths } from '@cookie-amazon/protocol'
import { TargetClient } from '../client'
import { TARGET_REGISTRY } from '../registry'
import {
  SELLERSPRITE_ADAPTER,
  executeSellerSpriteKeywordProductResearch,
  executeSellerSpriteMarketSelection,
  listSellerSpriteAbaPeriods,
  researchSellerSpriteAba,
  mineSellerSpriteKeywords,
  parseSellerSpriteMarketResearchHtml,
  readSellerSpriteMonthly,
  researchSellerSpriteMarket,
  researchSellerSpriteCompetitors,
  reverseSellerSpriteKeywords,
  selectSellerSpriteProducts,
  listSellerSpriteCategoryNodes,
  listSellerSpriteReviewComments,
  isSellerSpriteAuthenticatedCookie,
} from '../sellersprite'

const productSelectionInput = {
  eligibility: [], filterSub: false, lowPrice: 'N' as const, market: 'US', monthName: 'bsr_sales_nearly',
  nodeIdPaths: ['7141123011:7586165011:14194766011:14194769011'], order: { desc: true, field: 'total_units' }, page: 1, pkgDimensionTypeList: [],
  productTags: [], selectType: '2' as const, sellerNationList: [], sellerTypes: [], size: 60,
  symbolFlag: false, weightUnit: 'g' as const, minRanking: '10000', maxRanking: '50000',
  maxSales: '300', maxPrice: '30', maxSellers: '1',
}

const competitorInput = {
  asins: [], keywords: 'wireless charger', brand: '', seller: '', lowPrice: 'N' as const,
  market: 'US', monthName: 'bsr_sales_nearly', nodeIdPaths: [],
  order: { desc: true, field: 'amz_unit' }, page: 1, size: 20, symbolFlag: false,
}

const keywordMiningInput = {
  amazonChoice: false, desc: true, filterRootWord: 0, historyDate: '',
  keyword: 'phone stand', keywordBidMatchType: 'exact', market: 1, matchType: 0,
  orderBy: 21, pageNum: 1, pageSize: 50,
}

const htmlResponse = (
  url: string,
  init: ResponseInit = {},
): Response => {
  const response = new Response('<html>private content must not be read</html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

describe('SellerSprite session adapter', () => {
  it('recognizes only non-empty authenticated session cookies', () => {
    expect(isSellerSpriteAuthenticatedCookie('Sprite-X-Token', 'token')).toBe(true)
    expect(isSellerSpriteAuthenticatedCookie('rank-login-user', 'user')).toBe(true)
    expect(isSellerSpriteAuthenticatedCookie('rank-login-user-info', 'info')).toBe(true)
    expect(isSellerSpriteAuthenticatedCookie('Sprite-X-Token', '   ')).toBe(false)
    expect(isSellerSpriteAuthenticatedCookie('Hm_lvt_analytics', 'tracking')).toBe(false)
    expect(isSellerSpriteAuthenticatedCookie('language', 'zh-CN')).toBe(false)
  })

  it('is statically registered with the exact optional origin and login endpoint', () => {
    expect(TARGET_REGISTRY.get('sellersprite')).toBe(SELLERSPRITE_ADAPTER)
    expect(SELLERSPRITE_ADAPTER.origin).toBe('https://www.sellersprite.com')
    expect(SELLERSPRITE_ADAPTER.permissionOrigins).toEqual(['https://www.sellersprite.com/*'])
    expect(SELLERSPRITE_ADAPTER.operations.CHECK_LOGIN).toEqual({
      enabled: true,
      path: '/v3/api/client',
      method: 'GET',
      timeoutMs: 8_000,
      response: 'html-login-probe',
    })
    expect(SELLERSPRITE_ADAPTER.operations.GET_PROFILE.enabled).toBe(false)
  })

  it('uses browser-managed credentials and accepts the verified JSON session envelope', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v3/api/client')
      expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
      expect(init?.headers).toBeUndefined()
      expect(init?.body).toBeUndefined()
      const response = new Response(JSON.stringify({
        code: 'OK', message: '成功', data: { id: 1 }, success: true,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
      Object.defineProperty(response, 'url', { value: 'https://www.sellersprite.com/v3/api/client' })
      return response
    })

    await expect(new TargetClient(SELLERSPRITE_ADAPTER, fetcher).checkLogin()).resolves.toEqual({ loggedIn: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('maps same-origin redirects and unauthenticated statuses to logged out', async () => {
    const redirected = new TargetClient(
      SELLERSPRITE_ADAPTER,
      async () => htmlResponse('https://www.sellersprite.com/login'),
    )
    await expect(redirected.checkLogin()).resolves.toEqual({ loggedIn: false })

    const unauthorized = new TargetClient(
      SELLERSPRITE_ADAPTER,
      async () => htmlResponse('https://www.sellersprite.com/v3/api/client', { status: 401 }),
    )
    await expect(unauthorized.checkLogin()).resolves.toEqual({ loggedIn: false })
  })

  it('accepts SellerSprite JSON session responses and rejects unknown JSON responses', async () => {
    const foreignRedirect = new TargetClient(
      SELLERSPRITE_ADAPTER,
      async () => htmlResponse('https://attacker.example/login'),
    )
    await expect(foreignRedirect.checkLogin()).rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })

    const jsonResponse = new TargetClient(SELLERSPRITE_ADAPTER, async () => {
      const response = new Response(JSON.stringify({ code: 1, data: { userId: 'u1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
      Object.defineProperty(response, 'url', { value: 'https://www.sellersprite.com/v3/api/client' })
      return response
    })
    await expect(jsonResponse.checkLogin()).resolves.toEqual({ loggedIn: true })

    const expiredResponse = new TargetClient(SELLERSPRITE_ADAPTER, async () => {
      const response = new Response(JSON.stringify({
        code: 'ERR_GLOBAL_SESSION_EXPIRED',
        data: '/user/login?callback=/v3/api/client',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
      Object.defineProperty(response, 'url', { value: 'https://www.sellersprite.com/v3/api/client' })
      return response
    })
    await expect(expiredResponse.checkLogin()).resolves.toEqual({ loggedIn: false })

    const unknownJson = new TargetClient(SELLERSPRITE_ADAPTER, async () => {
      const response = new Response(JSON.stringify({ user: 'private' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
      Object.defineProperty(response, 'url', { value: 'https://www.sellersprite.com/v3/api/client' })
      return response
    })
    await expect(unknownJson.checkLogin()).rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })
    await expect(SELLERSPRITE_ADAPTER.getProfile(unknownJson)).rejects.toMatchObject({ code: 'OPERATION_DISABLED' })
  })

  it('prepares reverse analysis and posts the verified reversing request', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init).toMatchObject({
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
      })
      if (fetcher.mock.calls.length === 1) {
        expect(String(input)).toBe('https://www.sellersprite.com/v3/api/relation/stat-keywords')
        expect(JSON.parse(String(init?.body))).toEqual({
          asin: 'B000000000', marketId: 1, month: '', forceReStat: false, badges: [], limit: 20,
        })
        return new Response(JSON.stringify({
          code: 'OK',
          message: '成功',
          data: {
            market: 'GLOBAL',
            asin: 'B000000000',
            statDto: {
              market: 'GLOBAL',
              asin: 'B000000000',
              keywords: 61,
              ranks: 38,
              ads: 30,
              badges: { NATURAL_SEARCHING: 38, ADS: 22, SPONSOR_BRAND: 11 },
              variations: false,
              calcTime: 1_787_485_514_643,
              presents: null,
              missing: null,
            },
            marketId: 1,
            website: 'https://www.amazon.com',
            status: 'COMPLETE',
            analysisTook: 0,
            writeMode: null,
          },
          success: true,
          privateValue: 'must-not-leak',
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      expect(String(input)).toBe('https://www.sellersprite.com/v3/api/relation/reversing?market=COM')
      expect(JSON.parse(String(init?.body))).toEqual({
        asin: 'B000000000', limit: 20, skip: 0, month: '', badges: [],
        conversionKeywordTypes: [], trafficKeywordTypes: [], order: 12, desc: true,
        exactly: false, ac: false, filterDeletedKeywords: false, keywordBidMatchType: 'exact',
      })
      return new Response(JSON.stringify({
        code: 'OK',
        data: {
          total: 1,
          items: [{
            keywords: 'example', searches: '100', products: null, supplyDemandRatio: 1,
            trafficPercentage: 0.5, purchaseRate: null, bid: 1.2, bidMin: null,
            bidMax: 2, avgPrice: 20, avgRating: null, avgReviews: '10',
            searchesTrend: [{ month: '2026-01', searchRank: null, searches: '100' }],
            privateValue: 'must-not-leak',
            rankPosition: { page: 1, pageSize: 25, index: 6, position: 6 },
            adPosition: { page: 2, pageSize: 27, index: 32, position: 118 },
            naturalRatio: '0.76',
            adRatio: 0.24,
            positions: ['NT', 'SPONSOR_BRAND'],
          }],
          marketId: 1, website: 'https://www.amazon.com', stats: { privateValue: 'must-not-leak' },
        },
        privateValue: 'must-not-leak',
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })

    await expect(reverseSellerSpriteKeywords(new TargetClient(SELLERSPRITE_ADAPTER, fetcher), {
      asin: 'B000000000', marketId: 1, month: '', forceReStat: false, badges: [], limit: 20,
    })).resolves.toEqual({
      asin: 'B000000000',
      total: 1,
      items: [{
        keywords: 'example', searches: 100, products: null, supplyDemandRatio: 1,
        trafficPercentage: 0.5, purchaseRate: null, bid: 1.2, bidMin: null,
        bidMax: 2, avgPrice: 20, avgRating: null, avgReviews: 10,
        searchesTrend: [{ month: '2026-01', searchRank: null, searches: 100 }],
        natural: { page: 1, rank: 6 },
        ad: { page: 2, rank: 118 },
        naturalRatio: 0.76,
        adRatio: 0.24,
        positionTypes: ['NT', 'SPONSOR_BRAND'],
      }],
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps readable rows when one row carries an unreadable position object', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('stat-keywords')) {
        return new Response(JSON.stringify({ code: 'OK', data: { statDto: {}, status: null } }), {
          status: 200, headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        code: 'OK',
        data: {
          total: 2,
          items: [
            {
              keywords: 'good row', searches: 100, products: null, supplyDemandRatio: null,
              trafficPercentage: null, purchaseRate: null, bid: null, bidMin: null, bidMax: null,
              avgPrice: null, avgRating: null, avgReviews: null, searchesTrend: null,
              rankPosition: { page: 1, position: 6 }, adPosition: null,
              naturalRatio: 0.5, adRatio: null, positions: ['NT'],
            },
            {
              keywords: 'broken row', searches: 50, products: null, supplyDemandRatio: null,
              trafficPercentage: null, purchaseRate: null, bid: null, bidMin: null, bidMax: null,
              avgPrice: null, avgRating: null, avgReviews: null, searchesTrend: null,
              rankPosition: 'not-an-object', adPosition: null,
              naturalRatio: null, adRatio: null, positions: null,
            },
          ],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const result = await reverseSellerSpriteKeywords(new TargetClient(SELLERSPRITE_ADAPTER, fetcher), {
      asin: 'B000000000', marketId: 1, month: '', forceReStat: false, badges: [], limit: 20,
    })
    // 一行坏位置不该让整个响应失败：那一行报未知，可读的行照常返回。
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({ keywords: 'good row', natural: { page: 1, rank: 6 } })
    expect(result.items[1]).toMatchObject({ keywords: 'broken row', natural: null })
  })

  it('maps the US market id to SellerSprite COM and rejects unverified markets', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      code: 'OK', data: { statDto: {}, status: null },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new TargetClient(SELLERSPRITE_ADAPTER, fetcher)

    await expect(reverseSellerSpriteKeywords(client, {
      asin: 'B000000000', marketId: 2, month: '', forceReStat: false, badges: [], limit: 20,
    })).rejects.toMatchObject({
      code: 'TARGET_API_ERROR', targetMessage: '不支持的关键词反查市场',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('normalizes null keyword items and rejects malformed keyword rows', async () => {
    const cappedClient = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response(JSON.stringify({
      code: 'OK',
      data: { asin: 'B000000000', total: '1,000', items: null, stats: null },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const input = {
      asin: 'B000000000', marketId: 1, month: '', forceReStat: false, badges: [], limit: 20,
    }
    await expect(reverseSellerSpriteKeywords(cappedClient, input)).resolves.toEqual({
      asin: 'B000000000', total: 1_000, items: [],
    })

    const malformedClient = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response(JSON.stringify({
      code: 'OK',
      data: { asin: 'B000000000', total: 1, items: [{ keywords: 'example', searches: {} }] },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(reverseSellerSpriteKeywords(malformedClient, input))
      .rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })
  })

  it('preserves safe upstream details when reverse preparation fails', async () => {
    const client = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response(JSON.stringify({
      code: 'INVALID_ASIN', message: 'ASIN 参数无效', privateValue: 'must-not-leak',
    }), { status: 400, headers: { 'content-type': 'application/json' } }))

    await expect(reverseSellerSpriteKeywords(client, {
      asin: 'B000000000', marketId: 1, month: '', forceReStat: false, badges: [], limit: 20,
    })).rejects.toMatchObject({
      code: 'TARGET_API_ERROR', status: 400, targetCode: 'INVALID_ASIN', targetMessage: 'ASIN 参数无效',
    })
  })

  it('loads ABA periods and posts the verified monthly pagination body', async () => {
    const periodsClient = new TargetClient(SELLERSPRITE_ADAPTER, vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v3/api/aba-research/tables')
      expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
      return new Response(JSON.stringify({
        code: 'OK', message: '成功',
        data: {
          weekTables: [{ table: 'ara_20260815', label: '20260815' }],
          monthTables: [{ table: 'ara_202607', label: '202607' }],
          restrictions: [{ privateValue: 'must-not-surface' }],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    await expect(listSellerSpriteAbaPeriods(periodsClient)).resolves.toEqual({
      weekTables: [{ table: 'ara_20260815', label: '20260815' }],
      monthTables: [{ table: 'ara_202607', label: '202607' }],
    })

    const input = {
      reverseType: 'M' as const, table: 'ara_202607', q: 'screen protector',
      market: 'COM' as const, page: 2, size: 50,
    }
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://www.sellersprite.com/v3/api/aba-research')
      expect(init).toMatchObject({
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      })
      expect(JSON.parse(String(init?.body))).toEqual({
        rankGrowthType: 'W1', size: 50, page: 2, market: 'COM', q: 'screen protector',
        table: 'ara_202607', reverseType: 'M', departments: [], keywordBidMatchType: 'exact',
        order: { field: 'searchfrequencyrank', desc: false },
      })
      return new Response(JSON.stringify({
        code: 'OK', message: '成功',
        data: {
          pages: 90, page: 2, size: 50, total: 4490, took: 46,
          items: [{
            keyword: 'iphone screen protector', keywordCn: '手机膜', searches: '185,231',
            clicks: 81473, impressions: 4464850, purchaseRate: 0.0073, purchases: 1352,
            products: 6057, departments: ['Cell Phones & Accessories'], searchRank: 354,
            searchRankGrowthValue: 4, searchRankGrowthRate: 0.0112, cvsShareRate: 0.3193,
            clickShareRate: 0.3423, gkDatas: [{ asin: 'must-not-surface' }],
          }],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    await expect(researchSellerSpriteAba(new TargetClient(SELLERSPRITE_ADAPTER, fetcher), input)).resolves.toEqual({
      page: 2, pages: 90, size: 50, total: 4490, took: 46, hasNextPage: true,
      items: [{
        keyword: 'iphone screen protector', keywordCn: '手机膜', keywordJp: null,
        searches: 185231, clicks: 81473, impressions: 4464850, purchaseRate: 0.0073,
        purchases: 1352, products: 6057, departments: ['Cell Phones & Accessories'],
        searchRank: 354, searchRankGrowthValue: 4, searchRankGrowthRate: 0.0112,
        cvsShareRate: 0.3193, clickShareRate: 0.3423,
      }],
    })
  })

  it('preserves SellerSprite ABA API error details for diagnostics', async () => {
    const client = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response(JSON.stringify({
      code: 'QUOTA_EXCEEDED', message: '查询次数已用完', data: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(researchSellerSpriteAba(client, {
      reverseType: 'W', table: 'ara_20260815', q: 'screen protector', market: 'COM', page: 1, size: 50,
    })).rejects.toMatchObject({
      code: 'TARGET_API_ERROR', targetCode: 'QUOTA_EXCEEDED', targetMessage: '查询次数已用完',
    })
  })

  it('posts keyword scans, derives null pagination flags, and minimizes product fields', async () => {
    expect(SELLERSPRITE_ADAPTER.operations.COMPETITOR_RESEARCH).toEqual({
      enabled: true, path: '/v3/api/competing-lookup', method: 'POST', timeoutMs: 15_000,
      response: 'competitor-research',
    })
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v3/api/competing-lookup')
      expect(init).toMatchObject({ method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' } })
      expect(JSON.parse(String(init?.body))).toEqual(competitorInput)
      return new Response(JSON.stringify({
        code: 'OK',
        data: {
          page: 1, pages: 2, size: 20, total: 21, hasNextPage: 'true',
          items: [{
            asin: 'B000000000', title0: 'Example', brand0: 'Brand', imageSrc: 'https://example.com/image.jpg',
            price: '20', reviews: '10', amzUnit: '1,000',
            totalAmount: 2_000, sellerName: 'private-field-must-not-surface',
          }, {
            terminal: true, message: 'non-product placeholder must be ignored',
          }],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })

    await expect(researchSellerSpriteCompetitors(new TargetClient(SELLERSPRITE_ADAPTER, fetcher), competitorInput))
      .resolves.toEqual({
        page: 1, pages: 2, size: 20, total: 21, hasNextPage: true,
        items: [{
          asin: 'B000000000', title: 'Example', brand: 'Brand', imageUrl: 'https://example.com/image.jpg',
          price: 20, rating: null, reviews: 10, estimatedSales: 1_000,
          availableDate: null, availableDays: null,
        }],
      })
  })

  it('normalizes free-tier item caps and separates API errors from malformed responses', async () => {
    const cappedClient = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response(JSON.stringify({
      code: 'OK',
      data: { page: 4, pages: 100, size: 60, total: 6_000, items: null },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(researchSellerSpriteCompetitors(cappedClient, competitorInput)).resolves.toEqual({
      page: 4, pages: 100, size: 60, total: 6_000, hasNextPage: false, items: [],
    })

    const apiErrorClient = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response(JSON.stringify({
      code: 'QUOTA_EXCEEDED', data: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(researchSellerSpriteCompetitors(apiErrorClient, competitorInput))
      .rejects.toMatchObject({ code: 'TARGET_API_ERROR' })
  })

  it('reports bounded competitor contract diagnostics with endpoint and response shape', async () => {
    const body = JSON.stringify({
      code: 'OK',
      data: { page: 1, size: 20, total: 1, items: [], privateValue: 'must-not-leak' },
    })
    const client = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json;charset=UTF-8' },
    }))

    await expect(researchSellerSpriteCompetitors(client, competitorInput)).rejects.toMatchObject({
      code: 'TARGET_RESPONSE_INVALID',
      status: 200,
      targetCode: 'OK',
      targetMessage: expect.stringMatching(/接口 竞品查询 POST \/v3\/api\/competing-lookup；阶段 竞品研究响应合同；HTTP 200；Content-Type application\/json;charset=UTF-8；响应长度 \d+；响应分页字段 data\.pages 缺失或类型无效；摘要 envelope=\[code,data\] data=object\[page,size,total,items,privateValue\]/),
    })
  })

  it('exposes product selection with the fixed endpoint and minimizes item fields', async () => {
    expect(SELLERSPRITE_ADAPTER.operations.PRODUCT_SELECTION).toEqual({
      enabled: true, path: '/v3/api/product-research', method: 'POST', timeoutMs: 15_000,
      response: 'product-selection',
    })
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v3/api/product-research')
      expect(init).toMatchObject({ method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' } })
      expect(JSON.parse(String(init?.body))).toEqual(productSelectionInput)
      return new Response(JSON.stringify({
        code: 'OK',
        data: {
          page: 1, pages: 5, size: 20, total: 100, hasNextPage: true,
          items: [{
            asin: 'B000000000', title: 'Example', brand: null, imageUrl: null,
            price: 20, rating: null, reviews: 10, amzUnit: 240, leak: 'must-not-surface',
          }],
          leak: 'must-not-surface',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })

    await expect(selectSellerSpriteProducts(new TargetClient(SELLERSPRITE_ADAPTER, fetcher), productSelectionInput))
      .resolves.toEqual({
        page: 1, pages: 5, size: 20, total: 100, hasNextPage: true,
        items: [{
          asin: 'B000000000', title: 'Example', brand: null, imageUrl: null,
          price: 20, rating: null, reviews: 10, estimatedSales: 240,
          availableDate: null, availableDays: null, salesGrowth: null, salesGrowthYoy: null,
          revenue: null, bsrRank: null, sellers: null, categoryName: null, nodeLabelPath: null,
        }],
      })
  })

  it('loads category nodes and review comments with verified contracts and safe fields only', async () => {
    const categoryClient = new TargetClient(SELLERSPRITE_ADAPTER, vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v2/competitor-lookup/nodes?marketld=1&table=bsr_sales_nearly')
      expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
      return new Response(JSON.stringify({
        parent: null, code: 'OK', size: 1,
        items: [{
          id: '2619525011', label: 'Appliances', nodeLabelLocale: '家电', products: 83290,
          children: 7, alias: 'must-not-surface', nodeLabelPathLocale: '家电',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json;charset=UTF-8' } })
    }))
    await expect(listSellerSpriteCategoryNodes(categoryClient, { marketld: 1, table: 'bsr_sales_nearly' }))
      .resolves.toEqual({
        parent: null,
        items: [{
          id: '2619525011', label: 'Appliances', labelLocale: '家电',
          labelPath: null, labelPathLocale: '家电', products: 83290, children: 7,
        }],
      })

    const childCategoryClient = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response(JSON.stringify({
      parent: {
        id: '468642', label: 'Video Games', nodeLabelLocale: '视频游戏', products: 94655, children: 15,
      },
      code: 'OK', size: 1,
      items: [{
        id: '468642:16227128011', label: 'Video Games:Nintendo Switch',
        nodeLabelLocale: '任天堂开关', products: 10474, children: 4,
      }],
    }), { status: 200, headers: { 'content-type': 'application/json;charset=UTF-8' } }))
    await expect(listSellerSpriteCategoryNodes(childCategoryClient, { marketld: 1, table: 'bsr_sales_nearly' }))
      .resolves.toEqual({
        parent: '468642',
        items: [{
          id: '468642:16227128011', label: 'Video Games:Nintendo Switch',
          labelLocale: '任天堂开关', labelPath: null, labelPathLocale: null,
          products: 10474, children: 4,
        }],
      })

    const reviewInput = {
      asin: 'B08H26Z7D9', keyword: '' as const, market: 'US', pageNum: 1, pageSize: 20,
      reviewEndTime: null, reviewStartTime: null, order: { fieldName: 'date' as const, sort: 1 as const },
      starList: [], typeList: [], variations: [],
    }
    const reviewClient = new TargetClient(SELLERSPRITE_ADAPTER, vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v3/api/review-analysis/comment')
      expect(init).toMatchObject({ method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' } })
      expect(JSON.parse(String(init?.body))).toEqual(reviewInput)
      return new Response(JSON.stringify({
        code: 'OK', message: '成功', success: true,
        data: {
          page: 1, size: 20, total: 207, took: 0,
          items: [{
            id: 'USR1', asin: 'B08H26Z7D9', parent: 'B0FH9C8V7Y', date: 1782748800000,
            title: 'Shape not as advertised', titleCn: '形状与宣传不符', content: 'No shape but durable',
            contentCn: '虽然耐用但没有形状', star: 3, skus: ['Color: Ivory'], likes: 2,
            images: null, verified: true, vine: false, author: 'must-not-surface', authorId: 'private',
          }],
        },
      }), { status: 200, headers: { 'content-type': 'application/json;charset=UTF-8' } })
    }))
    const result = await listSellerSpriteReviewComments(reviewClient, reviewInput)
    expect(result).toEqual({
      page: 1, size: 20, total: 207, took: 0,
      items: [{
        id: 'USR1', asin: 'B08H26Z7D9', parent: 'B0FH9C8V7Y', date: 1782748800000,
        title: 'Shape not as advertised', titleCn: '形状与宣传不符', content: 'No shape but durable',
        contentCn: '虽然耐用但没有形状', star: 3, skus: ['Color: Ivory'], likes: 2,
        images: [], verified: true, vine: false,
      }],
    })
    expect(JSON.stringify(result)).not.toContain('must-not-surface')
    expect(JSON.stringify(result)).not.toContain('authorId')
  })

  it('posts the verified market form and returns only whitelisted table values', async () => {
    const selectedMonth = getSellerSpriteMarketResearchMonths()[1]!
    const fixture = `<!doctype html><html><body><script>window.privateToken='must-not-leak'</script>
      <table id="table-condition-search"><thead><tr>
        <th>#</th><th>细分市场 <span>表头说明不得影响字段识别</span></th><th>样本数量</th><th>月总销量</th>
        <th>月均销量 头部商品</th><th>月均销售额 头部商品</th><th>平均评分数 平均星级</th>
        <th>平均BSR 头部商品</th><th>平均卖家数 平均价格</th><th>卖家类型</th>
        <th>集中度指标</th><th>新品数量 新品占比</th><th>商品总数</th><th>退货率 同类目均值</th><th>操作</th>
      </tr></thead><tbody><tr>
        <td>1</td><td><a href="javascript:;">Telephone Stands</a><span>private detail</span></td>
        <td>商品: 24 品牌: 19 卖家: 21</td><td>20,699</td><td>862 2,044 (2.4)</td>
        <td>$ 10,875 $ 22,525</td><td>1,787 4.3</td><td>196,138 89,900</td>
        <td>3.8 $ 70.85</td><td>FBA: 54% AMZ: 4% FBM: 31%</td>
        <td>商品: 98.8% 品牌: 99.2% 卖家: 99.2%</td><td>7 29.17%</td><td>124</td>
        <td>2.38% 4.68%</td><td>操作</td>
      </tr></tbody></table></body></html>`
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v2/market-research')
      expect(init).toMatchObject({
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      })
      const form = new URLSearchParams(String(init?.body))
      expect(String(init?.body)).toContain('departmentKeyword=phone+stand')
      expect(String(init?.body)).toContain(`monthName=${selectedMonth}`)
      expect(form.size).toBe(73)
      expect([...form.entries()].slice(12).every(([, value]) => value === '')).toBe(true)
      expect(Object.fromEntries(form.entries())).toMatchObject({
        marketId: '1', nodeIdPath: '', sampleNumber: '1', topn: '10', newReleaseNum: '12',
        'order.field': 'total_sales', 'order.desc': 'true', tab: '1', monthName: selectedMonth,
        newReleaseNumSelect: '12', topNSelect: '10', departmentKeyword: 'phone stand',
        minAvgSales: '', maxAvgSales: '', minAvgProfit: '', maxAvgProfit: '',
        minNewAvgSales: '', maxNewAvgSales: '',
      })
      return new Response(fixture, { status: 200, headers: { 'content-type': 'text/html;charset=UTF-8' } })
    })

    const result = await researchSellerSpriteMarket(
      new TargetClient(SELLERSPRITE_ADAPTER, fetcher),
      {
        marketId: 1,
        departmentKeyword: 'phone stand',
        monthName: selectedMonth,
        newReleaseNum: 12,
      },
    )
    expect(result.rows).toEqual([{
      marketName: 'Telephone Stands', sampleProducts: 24, sampleBrands: 19, sampleSellers: 21,
      totalSales: 20699, averageSales: 862, headSales: 2044, averageRevenue: 10875,
      headRevenue: 22525, averageReviews: 1787, averageRating: 4.3, averageBsr: 196138,
      headBsr: 89900, averageSellers: 3.8, averagePrice: 70.85, fbaRatio: 0.54,
      amzRatio: 0.04, fbmRatio: 0.31, productConcentration: 0.988,
      brandConcentration: 0.992, sellerConcentration: 0.992, newProductCount: 7,
      newProductRatio: 0.2917, totalProducts: 124, profit: null,
    }])
    expect(result.fieldCoverage).toEqual({
      sampleCounts: 1, totalSales: 1, averageSales: 1, averageRevenue: 1, rating: 1,
      bsr: 1, price: 1, sellerTypes: 1, concentration: 1, newProducts: 1,
      totalProducts: 1, profit: 0,
    })
    expect(JSON.stringify(result)).not.toContain('must-not-leak')
    expect(JSON.stringify(result)).not.toContain('<html')
    expect(() => researchSellerSpriteMarket(
      new TargetClient(SELLERSPRITE_ADAPTER, fetcher),
      {
        marketId: 1,
        departmentKeyword: 'phone stand',
        monthName: 'bsr_sales_monthly_199901',
        newReleaseNum: 9,
      } as never,
    )).toThrowError(expect.objectContaining({ code: 'TARGET_API_ERROR' }))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('treats a recognizable market form without a result table as an empty result', () => {
    const html = `<html><form id="form-condition-search" action="/v2/market-research">
      <input type="hidden" name="marketId" value="1">
      <input name="departmentKeyword" value="keyword without matching market">
    </form></html>`
    expect(parseSellerSpriteMarketResearchHtml(html)).toEqual({
      rows: [],
      fieldCoverage: {
        sampleCounts: 0, totalSales: 0, averageSales: 0, averageRevenue: 0, rating: 0,
        bsr: 0, price: 0, sellerTypes: 0, concentration: 0, newProducts: 0,
        totalProducts: 0, profit: 0,
      },
      profitStatus: 'not-integrated',
    })
  })

  it('rejects market HTML without the exact whitelisted table or recognizable form', () => {
    expect(() => parseSellerSpriteMarketResearchHtml('<table id="other"><tr><td>secret</td></tr></table>'))
      .toThrowError(expect.objectContaining({ code: 'TARGET_RESPONSE_INVALID' }))
  })

  it('reports market HTML diagnostics with endpoint, metadata, length, and parser reason', async () => {
    const body = '<html><title>Market Research</title><table id="other"><tr><td>safe summary</td></tr></table></html>'
    const client = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html;charset=UTF-8' },
    }))
    await expect(researchSellerSpriteMarket(client, {
      marketId: 1, departmentKeyword: 'phone stand', monthName: 'bsr_sales_nearly', newReleaseNum: 3,
    })).rejects.toMatchObject({
      code: 'TARGET_RESPONSE_INVALID',
      status: 200,
      targetMessage: expect.stringMatching(/接口 市场研究 POST \/v2\/market-research；阶段 市场研究 HTML 合同；HTTP 200；Content-Type text\/html;charset=UTF-8；响应长度 \d+；市场研究 HTML 缺少结果表和可识别的空结果表单；摘要 Market Research safe summary/),
    })
  })

  it('accepts large legitimate market pages and keeps an upper safety bound', () => {
    const headers = [
      '#', '细分市场', '样本数量', '月总销量', '月均销量 头部商品', '月均销售额 头部商品',
      '平均评分数 平均星级', '平均BSR 头部商品', '平均卖家数 平均价格', '卖家类型',
      '集中度指标', '新品数量 新品占比', '商品总数', '退货率', '操作',
    ]
    const table = `<table id="table-condition-search"><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></table>`
    expect(parseSellerSpriteMarketResearchHtml(`${'x'.repeat(2_100_000)}${table}`)).toMatchObject({
      rows: [], profitStatus: 'not-integrated',
    })
    expect(() => parseSellerSpriteMarketResearchHtml(`${'x'.repeat(8_000_001)}${table}`))
      .toThrowError(expect.objectContaining({
        code: 'TARGET_RESPONSE_INVALID', targetMessage: expect.stringContaining('超过安全上限'),
      }))
  })

  it('gets the verified monthly query and minimizes variation fields', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v3/api/relation/ta/monthly?asin=B000000000&month=&station=US')
      expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
      expect(init?.headers).toBeUndefined()
      expect(init?.body).toBeUndefined()
      return new Response(JSON.stringify({
        code: 'OK',
        data: {
          monthlyDto: { unverifiedHistory: 'must-not-surface' },
          variations: [{
            asin: 'B000000000', availableDate: '1,700,000,000,000', availableDays: '120',
            bsrLabel: 'Electronics', bsrRank: '1,234', currency: '$', price: '29.99',
            rating: 4.5, reviews: '321', reviewsRate: '0.03', station: 'US', title: 'Example',
            alias: 'must-not-surface', sku: 'private-field',
          }],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })

    await expect(readSellerSpriteMonthly(new TargetClient(SELLERSPRITE_ADAPTER, fetcher), {
      asin: 'B000000000', month: '', station: 'US',
    })).resolves.toEqual({
      historyStatus: 'not-verified',
      variations: [{
        asin: 'B000000000', availableDate: 1_700_000_000_000, availableDays: 120,
        bsrLabel: 'Electronics', bsrRank: 1_234, currency: '$', price: 29.99,
        rating: 4.5, reviews: 321, reviewsRate: 0.03, station: 'US', title: 'Example',
      }],
    })
  })

  it('posts keyword mining requests and whitelists the paginated response fields', async () => {
    expect(SELLERSPRITE_ADAPTER.operations.KEYWORD_MINING).toEqual({
      enabled: true, path: '/v3/api/keyword-miner', method: 'POST', timeoutMs: 15_000,
      response: 'keyword-mining',
    })
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v3/api/keyword-miner')
      expect(init).toMatchObject({
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      })
      expect(JSON.parse(String(init?.body))).toEqual(keywordMiningInput)
      return new Response(JSON.stringify({
        code: 'OK', message: '', success: true,
        data: {
          page: 1, size: 50, total: 5992, took: 361,
          items: [{
            market: 'GLOBAL', marketId: 1, website: 'https://www.amazon.com',
            keyword: 'phone stand', keywordCn: '手机支架', keywordJp: 'フォーンスタンド',
            departments: [{ code: 'wireless', label: 'Cell Phones & Accessories' }],
            trends: [{ month: '202607', search: 234037, searchRank: 2516 }],
            month: '2026.07', searches: 234037, purchases: 9689, purchaseRate: 0.0414,
            products: 2942, adProducts: 123, supplyDemandRatio: 0.8, avgPrice: 18.5,
            avgReviews: 1000, avgRating: 4.4, bid: 1.2, phrasePpc: 1.1, broadPpc: 1.3,
            exactPpc: 1.5, cvsShareRate: 0.2, wordCount: 2, titleDensity: 0.4,
            spr: 12, relevancy: 0.9, absoluteRelevancy: 80, amazonChoice: true,
            searchRank: 100, searchWeeklyRank: 105, clicks: 50000, impressions: 200000,
            privateValue: 'must-not-leak', gkDatas: [{ asin: 'must-not-leak' }],
          }],
        },
      }), { status: 200, headers: { 'content-type': 'application/json;charset=UTF-8' } })
    })

    await expect(mineSellerSpriteKeywords(new TargetClient(SELLERSPRITE_ADAPTER, fetcher), keywordMiningInput))
      .resolves.toEqual({
        page: 1, size: 50, total: 5992, took: 361,
        items: [{
          market: 'GLOBAL', marketId: 1, website: 'https://www.amazon.com',
          keyword: 'phone stand', keywordCn: '手机支架', keywordJp: 'フォーンスタンド',
          departments: [{ code: 'wireless', label: 'Cell Phones & Accessories' }],
          trends: [{ month: '202607', search: 234037, searchRank: 2516 }],
          month: '2026.07', searches: 234037, purchases: 9689, purchaseRate: 0.0414,
          products: 2942, adProducts: 123, supplyDemandRatio: 0.8, avgPrice: 18.5,
          avgReviews: 1000, avgRating: 4.4, bid: 1.2, phrasePpc: 1.1, broadPpc: 1.3,
          exactPpc: 1.5, cvsShareRate: 0.2, wordCount: 2, titleDensity: 0.4,
          spr: 12, relevancy: 0.9, absoluteRelevancy: 80, amazonChoice: true,
          searchRank: 100, searchWeeklyRank: 105, clicks: 50000, impressions: 200000,
        }],
      })
    expect(JSON.stringify(await Promise.resolve(keywordMiningInput))).not.toContain('privateValue')

    const disabledClient = new TargetClient(SELLERSPRITE_ADAPTER, fetcher, { KEYWORD_MINING: { enabled: false } })
    await expect(mineSellerSpriteKeywords(disabledClient, keywordMiningInput))
      .rejects.toMatchObject({ code: 'OPERATION_DISABLED' })
  })

  it('maps protected business API session-expiry signals to an actionable login error', async () => {
    const expiredJson = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response(JSON.stringify({
      code: 'ERR_GLOBAL_SESSION_EXPIRED',
      message: '账号已在其他设备登录，请重新登录',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(reverseSellerSpriteKeywords(expiredJson, {
      asin: 'B000000000', marketId: 1, month: '', forceReStat: false, badges: [], limit: 20,
    })).rejects.toMatchObject({
      code: 'TARGET_NOT_LOGGED_IN',
      targetMessage: 'SellerSprite 登录已失效，账号可能已在其他设备登录，请重新登录。',
    })

    const forbidden = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response('', { status: 403 }))
    await expect(selectSellerSpriteProducts(forbidden, productSelectionInput))
      .rejects.toMatchObject({ code: 'TARGET_NOT_LOGGED_IN', status: 403 })
  })

  it('recognizes a 200 login page but keeps rate limits and server errors distinct', async () => {
    const loginHtmlClient = new TargetClient(SELLERSPRITE_ADAPTER, async () => {
      const response = new Response('<html><form id="login-form" action="/user/login">请重新登录</form></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
      Object.defineProperty(response, 'url', { value: 'https://www.sellersprite.com/v2/market-research' })
      return response
    })
    await expect(researchSellerSpriteMarket(loginHtmlClient, {
      marketId: 1, departmentKeyword: 'phone stand', monthName: 'bsr_sales_nearly', newReleaseNum: 3,
    })).rejects.toMatchObject({ code: 'TARGET_NOT_LOGGED_IN' })

    const limited = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response('', { status: 429 }))
    await expect(selectSellerSpriteProducts(limited, productSelectionInput))
      .rejects.toMatchObject({ code: 'TARGET_RATE_LIMITED' })
    const serverError = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response('', { status: 503 }))
    await expect(selectSellerSpriteProducts(serverError, productSelectionInput))
      .rejects.toMatchObject({ code: 'TARGET_API_ERROR', status: 503 })
  })

  it('returns only minimal completion status for HTML session capabilities', async () => {
    const marketClient = new TargetClient(SELLERSPRITE_ADAPTER, vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v2/market-research')
      expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
      return htmlResponse('https://www.sellersprite.com/v2/market-research')
    }))
    await expect(executeSellerSpriteMarketSelection(marketClient))
      .resolves.toEqual({ targetId: 'sellersprite', completed: true })

    const keywordClient = new TargetClient(SELLERSPRITE_ADAPTER, async () =>
      htmlResponse('https://www.sellersprite.com/v2/keyword-research'))
    await expect(executeSellerSpriteKeywordProductResearch(keywordClient))
      .resolves.toEqual({ targetId: 'sellersprite', completed: true })

    const loggedOut = new TargetClient(SELLERSPRITE_ADAPTER, async () =>
      htmlResponse('https://www.sellersprite.com/v2/market-research', { status: 401 }))
    await expect(executeSellerSpriteMarketSelection(loggedOut))
      .rejects.toMatchObject({ code: 'TARGET_NOT_LOGGED_IN' })

    const foreign = new TargetClient(SELLERSPRITE_ADAPTER, async () =>
      htmlResponse('https://attacker.example/v2/keyword-research'))
    await expect(executeSellerSpriteKeywordProductResearch(foreign))
      .rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })
  })
})
