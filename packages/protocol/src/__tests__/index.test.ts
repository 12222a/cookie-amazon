import { describe, expect, it } from 'vitest'
import {
  createPingRequest,
  createSellerSpriteKeywordReverseRequest,
  createTargetRequest,
  isAllowedWebOrigin,
  isPingRequest,
  isPingResponse,
  isSellerSpriteKeywordReverseRequest,
  isSellerSpriteKeywordReverseResponse,
  isTargetRequest,
  isTargetResponse,
} from '../index'

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
})