import { describe, expect, it } from 'vitest'
import {
  createPingRequest,
  createSellerSpriteHtmlSessionRequest,
  createSellerSpriteKeywordMiningRequest,
  createSellerSpriteKeywordReverseRequest,
  createSellerSpriteProductSelectionRequest,
  isAllowedWebOrigin,
  isPingRequest,
  isPingResponse,
  isSellerSpriteHtmlSessionRequest,
  isSellerSpriteHtmlSessionResponse,
  isSellerSpriteKeywordMiningRequest,
  isSellerSpriteKeywordMiningResponse,
  isSellerSpriteKeywordReverseRequest,
  isSellerSpriteKeywordReverseResponse,
  isSellerSpriteProductSelectionRequest,
  isSellerSpriteProductSelectionResponse,
  createTargetRequest,
  isTargetRequest,
  isTargetResponse,
} from '../index'

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

describe('protocol', () => {
  it('accepts a valid PING request', () => {
    expect(isPingRequest(createPingRequest('request-1'))).toBe(true)
  })

  it('rejects unknown actions and origins', () => {
    expect(isPingRequest({ ...createPingRequest('request-1'), action: 'FETCH' })).toBe(false)
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
      market: 'US', ac: false, asin: 'B000000000', badges: [], conversionKeywordTypes: [],
      desc: true, exactly: false, filterDeletedKeywords: false, keywordBidMatchType: 'broad',
      limit: 20, month: '2026-01', order: 'searches', skip: 0, trafficKeywordTypes: [],
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
      payload: { ...request.payload, input: { ...input, trafficKeywordTypes: [null, true, 1, 'organic'] } },
    })).toBe(true)

    expect(isSellerSpriteKeywordReverseResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-7', action: 'SELLERSPRITE_KEYWORD_REVERSE', ok: true,
      data: {
        asin: 'B000000000',
        items: [{
          keywords: 'example', searches: 100, products: null, supplyDemandRatio: 1,
          trafficPercentage: 0.5, purchaseRate: null, bid: 1.2, bidMin: null,
          bidMax: 2, avgPrice: 20, avgRating: null, avgReviews: 10,
          searchesTrend: [{ month: '2026-01', searchRank: null, searches: 100 }],
        }],
      },
    })).toBe(true)
  })

  it('validates product selection allowlists and paginated responses', () => {
    const request = createSellerSpriteProductSelectionRequest('request-8', 'sellersprite', productSelectionInput)
    expect(isSellerSpriteProductSelectionRequest(request)).toBe(true)
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