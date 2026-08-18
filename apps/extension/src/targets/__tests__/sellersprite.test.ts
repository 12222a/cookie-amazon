import { describe, expect, it, vi } from 'vitest'
import { TargetClient } from '../client'
import { TARGET_REGISTRY } from '../registry'
import {
  SELLERSPRITE_ADAPTER,
  executeSellerSpriteKeywordProductResearch,
  executeSellerSpriteMarketSelection,
  mineSellerSpriteKeywords,
  reverseSellerSpriteKeywords,
  selectSellerSpriteProducts,
} from '../sellersprite'

const productSelectionInput = {
  eligibility: [], filterSub: false, lowPrice: '0', market: 'US', monthName: '2026-01',
  nodeIdPaths: [], order: { desc: true, field: 'sales' }, page: 1, pkgDimensionTypeList: [],
  productTags: [], selectType: 'CATEGORY', sellerNationList: [], sellerTypes: [], size: 20,
  symbolFlag: false, weightUnit: 'lb',
}

const keywordMiningInput = {
  amazonChoice: false, desc: true, filterRootWord: false, historyDate: '2026-01',
  keyword: 'wireless earbuds', keywordBidMatchType: 'broad', market: 'US', matchType: 'BROAD',
  orderBy: 'searches', pageNum: 1, pageSize: 20,
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
  it('is statically registered with the exact optional origin and login endpoint', () => {
    expect(TARGET_REGISTRY.get('sellersprite')).toBe(SELLERSPRITE_ADAPTER)
    expect(SELLERSPRITE_ADAPTER.origin).toBe('https://www.sellersprite.com')
    expect(SELLERSPRITE_ADAPTER.permissionOrigins).toEqual(['https://www.sellersprite.com/*'])
    expect(SELLERSPRITE_ADAPTER.operations.CHECK_LOGIN).toEqual({
      enabled: true,
      path: '/v2/me',
      method: 'GET',
      timeoutMs: 8_000,
      response: 'html-login-probe',
    })
    expect(SELLERSPRITE_ADAPTER.operations.GET_PROFILE.enabled).toBe(false)
  })

  it('uses browser-managed credentials without accepting headers or reading HTML', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v2/me')
      expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
      expect(init?.headers).toBeUndefined()
      expect(init?.body).toBeUndefined()
      return htmlResponse('https://www.sellersprite.com/v2/me')
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
      async () => htmlResponse('https://www.sellersprite.com/v2/me', { status: 401 }),
    )
    await expect(unauthorized.checkLogin()).resolves.toEqual({ loggedIn: false })
  })

  it('rejects foreign redirects, non-HTML responses, and profile access', async () => {
    const foreignRedirect = new TargetClient(
      SELLERSPRITE_ADAPTER,
      async () => htmlResponse('https://attacker.example/login'),
    )
    await expect(foreignRedirect.checkLogin()).rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })

    const jsonResponse = new TargetClient(SELLERSPRITE_ADAPTER, async () => {
      const response = new Response(JSON.stringify({ user: 'private' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
      Object.defineProperty(response, 'url', { value: 'https://www.sellersprite.com/v2/me' })
      return response
    })
    await expect(jsonResponse.checkLogin()).rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })
    await expect(SELLERSPRITE_ADAPTER.getProfile(jsonResponse)).rejects.toMatchObject({ code: 'OPERATION_DISABLED' })
  })

  it('posts only the keyword reverse allowlist and minimizes the response', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v3/api/relation/reversing?market=US')
      expect(init).toMatchObject({
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
      })
      expect(JSON.parse(String(init?.body))).toEqual({
        ac: false, asin: 'B000000000', badges: [], conversionKeywordTypes: [], desc: true,
        exactly: false, filterDeletedKeywords: false, keywordBidMatchType: 'broad', limit: 20,
        month: '2026-01', order: 'searches', skip: 0, trafficKeywordTypes: [],
      })
      return new Response(JSON.stringify({
        code: 'OK',
        data: {
          asin: 'B000000000',
          items: [{
            keywords: 'example', searches: 100, products: null, supplyDemandRatio: 1,
            trafficPercentage: 0.5, purchaseRate: null, bid: 1.2, bidMin: null,
            bidMax: 2, avgPrice: 20, avgRating: null, avgReviews: 10,
            searchesTrend: [{ month: '2026-01', searchRank: null, searches: 100 }],
            privateValue: 'must-not-leak',
          }],
        },
        privateValue: 'must-not-leak',
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })

    await expect(reverseSellerSpriteKeywords(new TargetClient(SELLERSPRITE_ADAPTER, fetcher), {
      market: 'US', ac: false, asin: 'B000000000', badges: [], conversionKeywordTypes: [],
      desc: true, exactly: false, filterDeletedKeywords: false, keywordBidMatchType: 'broad',
      limit: 20, month: '2026-01', order: 'searches', skip: 0, trafficKeywordTypes: [],
    })).resolves.toEqual({
      asin: 'B000000000',
      items: [{
        keywords: 'example', searches: 100, products: null, supplyDemandRatio: 1,
        trafficPercentage: 0.5, purchaseRate: null, bid: 1.2, bidMin: null,
        bidMax: 2, avgPrice: 20, avgRating: null, avgReviews: 10,
        searchesTrend: [{ month: '2026-01', searchRank: null, searches: 100 }],
      }],
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
            price: 20, rating: null, reviews: 10, estimatedSales: null, leak: 'must-not-surface',
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
          price: 20, rating: null, reviews: 10, estimatedSales: null,
        }],
      })
  })

  it('accepts only empty keyword mining results and rejects unknown non-empty items', async () => {
    const emptyFetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v3/api/keyword-miner')
      expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
      expect(JSON.parse(String(init?.body))).toEqual(keywordMiningInput)
      return new Response(JSON.stringify({
        code: 'OK',
        data: { items: [], page: 1, size: 20, took: 12, total: 0 },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const miningOverride = { KEYWORD_MINING: { enabled: true } } as const
    await expect(mineSellerSpriteKeywords(new TargetClient(SELLERSPRITE_ADAPTER, emptyFetcher, miningOverride), keywordMiningInput))
      .resolves.toEqual({ items: [], page: 1, size: 20, took: 12, total: 0 })

    const nonEmptyFetcher = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response(JSON.stringify({
      code: 'OK', data: { items: [{ keyword: 'unknown' }], page: 1, size: 20, took: 12, total: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }), miningOverride)
    await expect(mineSellerSpriteKeywords(nonEmptyFetcher, keywordMiningInput))
      .rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })

    await expect(mineSellerSpriteKeywords(new TargetClient(SELLERSPRITE_ADAPTER, emptyFetcher), keywordMiningInput))
      .rejects.toMatchObject({ code: 'OPERATION_DISABLED' })
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