import { describe, expect, it } from 'vitest'
import {
  createSellerSpriteAdsInsightsRequest, createSellerSpriteAdsHistoryRequest,
  createSellerSpriteAdsKeywordsRequest, createSellerSpriteAdsHighFrequencyRequest,
  isSellerSpriteAdsRequest, isSellerSpriteAdsInsightsRequest, isSellerSpriteAdsHistoryRequest,
  isSellerSpriteAdsKeywordsRequest, isSellerSpriteAdsHighFrequencyRequest,
  isSellerSpriteAdsInsightsResponse, isSellerSpriteAdsHistoryResponse,
  isSellerSpriteAdsKeywordsResponse, isSellerSpriteAdsHighFrequencyResponse,
  type SellerSpriteAdsInsightsInput, type SellerSpriteAdsHistoryInput,
  type SellerSpriteAdsKeywordsInput, type SellerSpriteAdsHighFrequencyInput,
  type SellerSpriteAdsInsightsData, type SellerSpriteAdsGroup, type SellerSpriteAdsKeyword,
} from '../index'

const insights: SellerSpriteAdsInsightsInput = {
  asin: 'B0F9XY6HXB', market: 1, interval: 'week', months: 6, desc: false, pageNum: 1, pageSize: 20,
  orderByEffectiveness: false, type: '', campaignId: '', adId: '', variation: '', combination: false, brief: false,
}
const history: SellerSpriteAdsHistoryInput = { asin: insights.asin, market: 1, interval: 'week', months: 6, adId: 'ad-1' }
const highFrequency: SellerSpriteAdsHighFrequencyInput = {
  adId: 'ad-1', market: 1, interval: 'week', beginDate: '2026-09-01', endDate: '2026-10-31',
  keyword: '', orderField: 'updatedTime', desc: true,
}
const keywords: SellerSpriteAdsKeywordsInput = { ...highFrequency, pageNum: 1, pageSize: 50 }
const invalidDates = [
  { beginDate: '' }, { beginDate: 'not-a-date' }, { beginDate: '2026-13-01' },
  { beginDate: -1 }, { beginDate: 1.5 }, { beginDate: Number.NaN },
  { beginDate: 2, endDate: 1 },
  { beginDate: '1000000000', endDate: '999999999' },
  { beginDate: '2026-10-01T00:00:00Z', endDate: '2026-10-01T00:30:00+01:00' },
]
const invalidAdIds = [{ adId: '' }, { adId: '   ' }, { adId: 'ad-1' + String.fromCharCode(10) }]
const invalidPages = [{ pageNum: 0 }, { pageNum: 10001 }, { pageSize: 51 }]
const requestCases = [
  {
    name: 'insights', action: 'SELLERSPRITE_ADS_INSIGHTS', input: insights,
    request: createSellerSpriteAdsInsightsRequest('ads-request', 'sellersprite', insights), guard: isSellerSpriteAdsInsightsRequest,
    invalid: [{ asin: 'b0f9xy6hxb' }, { months: 24 }, { variation: 'invalid' }, { type: 'SBV' }, ...invalidPages],
  },
  {
    name: 'history', action: 'SELLERSPRITE_ADS_HISTORY', input: history,
    request: createSellerSpriteAdsHistoryRequest('ads-request', 'sellersprite', history), guard: isSellerSpriteAdsHistoryRequest,
    invalid: [{ months: 24 }, ...invalidAdIds],
  },
  {
    name: 'keywords', action: 'SELLERSPRITE_ADS_KEYWORDS', input: keywords,
    request: createSellerSpriteAdsKeywordsRequest('ads-request', 'sellersprite', keywords), guard: isSellerSpriteAdsKeywordsRequest,
    invalid: [...invalidAdIds, ...invalidPages, ...invalidDates, { orderField: 'searches' }],
  },
  {
    name: 'high frequency', action: 'SELLERSPRITE_ADS_HIGH_FREQUENCY', input: highFrequency,
    request: createSellerSpriteAdsHighFrequencyRequest('ads-request', 'sellersprite', highFrequency), guard: isSellerSpriteAdsHighFrequencyRequest,
    invalid: [...invalidAdIds, ...invalidDates, { pageNum: 1 }, { pageSize: 50 }, { orderField: 'searchesRank' }],
  },
]

const period = { beginDate: '2026-09-01', endDate: '2026-09-07', keywordsCount: null }
const group: SellerSpriteAdsGroup = { adId: 'ad-1', campaignId: 'campaign-1', asin: null, asinImage: null, type: 'SP', history: [period] }
const insightsData: SellerSpriteAdsInsightsData = {
  adCount: null, campaignCount: 1, sp: 0, spv: null, groups: [group],
  campaigns: [{ campaignId: 'campaign-1', type: null }], adIdList: ['ad-1'], variations: ['B0F9XY6HXB'],
}
const keyword: SellerSpriteAdsKeyword = {
  keyword: 'ghost blanket', keywordCn: null, keywordJp: null, asin: null, marketId: null,
  searchesRank: null, searches: null, impressions: null, clicks: null, cprExact: null, adProducts: null,
}
const keywordData = { pageNum: 1, pageSize: 50, total: 1, hasNextPage: false, items: [keyword] }
const response = (action: string, data: unknown) => ({
  namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
  requestId: 'ads-request', action, ok: true, data,
})
const responseCases = [
  {
    name: 'insights', action: 'SELLERSPRITE_ADS_INSIGHTS', guard: isSellerSpriteAdsInsightsResponse, data: insightsData,
    empty: { adCount: 0, campaignCount: 0, sp: 0, spv: 0, groups: [], campaigns: [], adIdList: [], variations: [] },
    invalid: [
      { ...insightsData, groups: [{ ...group, adId: undefined }] },
      { ...insightsData, groups: [{ ...group, campaignId: '' }] },
      { ...insightsData, groups: [{ ...group, raw: {} }] },
      { ...insightsData, campaigns: [{ type: 'SP' }] },
      { ...insightsData, campaigns: [{ campaignId: 'campaign-1', type: 'SP', raw: {} }] },
      { ...insightsData, adIdList: [''] },
      { ...insightsData, variations: ['invalid'] },
      { ...insightsData, groups: Array(51).fill(group) },
      { ...insightsData, groups: null, campaigns: null },
    ],
  },
  {
    name: 'history', action: 'SELLERSPRITE_ADS_HISTORY', guard: isSellerSpriteAdsHistoryResponse,
    data: { periods: [period] }, empty: { periods: [] },
    invalid: [
      { periods: null }, { periods: [{ ...period, keywordsCount: -1 }] },
      { periods: [{ ...period, beginDate: 'invalid' }] }, { periods: [{ ...period, raw: {} }] },
    ],
  },
  {
    name: 'keywords', action: 'SELLERSPRITE_ADS_KEYWORDS', guard: isSellerSpriteAdsKeywordsResponse, data: keywordData,
    empty: { ...keywordData, total: 0, items: [] },
    invalid: [
      { ...keywordData, total: null }, { ...keywordData, pageSize: 51 },
      { ...keywordData, items: [{ ...keyword, keyword: '' }] },
      { ...keywordData, items: [{ ...keyword, searches: Number.POSITIVE_INFINITY }] },
      { ...keywordData, items: [{ ...keyword, clicks: Number.NaN }] },
      { ...keywordData, items: [{ ...keyword, raw: {} }] }, { ...keywordData, items: Array(51).fill(keyword) },
    ],
  },
  {
    name: 'high frequency', action: 'SELLERSPRITE_ADS_HIGH_FREQUENCY', guard: isSellerSpriteAdsHighFrequencyResponse,
    data: { items: [{ keyword: 'ghost', total: 0 }] }, empty: { items: [] },
    invalid: [
      { items: [{ keyword: 'ghost', total: null }] }, { items: [{ keyword: 'ghost', total: -1 }] },
      { items: [{ keyword: 'ghost', total: 1.5 }] }, { items: [{ total: 1 }] },
      { items: [{ keyword: 'ghost', total: 1, raw: {} }] },
    ],
  },
]

describe('SellerSprite advertising requests', () => {
  it.each(requestCases)('constructs and guards $name with the complete envelope', ({ request, action, input, guard }) => {
    expect(request).toEqual({
      namespace: 'cookie-amazon-platform', kind: 'request', protocolVersion: 1, action,
      requestId: 'ads-request', payload: { targetId: 'sellersprite', input },
    })
    expect(guard(request)).toBe(true)
    expect(isSellerSpriteAdsRequest(request)).toBe(true)
    for (const invalid of [
      { ...request, action: 'UNKNOWN' }, { ...request, requestId: undefined },
      { ...request, protocolVersion: 2 }, { ...request, namespace: 'other' },
      { ...request, payload: { ...request.payload, targetId: '' } },
      { ...request, payload: { ...request.payload, unexpected: true } },
    ]) {
      expect(guard(invalid)).toBe(false)
      expect(isSellerSpriteAdsRequest(invalid)).toBe(false)
    }
  })

  it.each(requestCases)('rejects invalid $name inputs at the request boundary', ({ request, guard, invalid }) => {
    for (const patch of [{ unexpected: true }, { market: 2 }, { market: '1' }, ...invalid]) {
      const candidate = { ...request, payload: { ...request.payload, input: { ...request.payload.input, ...patch } } }
      expect(guard(candidate), JSON.stringify(patch)).toBe(false)
      expect(isSellerSpriteAdsRequest(candidate), JSON.stringify(patch)).toBe(false)
    }
  })

  it.each(requestCases)('rejects trailing control characters in $name ASINs or dates', ({ request, guard }) => {
    const patch = 'asin' in request.payload.input
      ? { asin: insights.asin + String.fromCharCode(10) }
      : { beginDate: highFrequency.beginDate + String.fromCharCode(10) }
    expect(guard({ ...request, payload: { ...request.payload, input: { ...request.payload.input, ...patch } } })).toBe(false)
  })

  it('accepts monthly 24-month queries, SPV, brief filters, and inclusive pagination limits', () => {
    const request = createSellerSpriteAdsInsightsRequest('ads-request', 'sellersprite', {
      ...insights, market: 44571, interval: 'month', months: 24, type: 'SPV', brief: true, pageNum: 10000, pageSize: 50,
    })
    expect(isSellerSpriteAdsInsightsRequest(request)).toBe(true)
    expect(isSellerSpriteAdsHistoryRequest(createSellerSpriteAdsHistoryRequest('ads-request', 'sellersprite', {
      ...history, interval: 'month', months: 24,
    }))).toBe(true)
  })

  it.each([
    { beginDate: 0, endDate: 0 },
    { beginDate: '1788220800000', endDate: '1793404800000' },
    { beginDate: '2026-09-01 00:00:00', endDate: '2026-10-31 23:59:59' },
    { beginDate: '2026-10-01T00:00:00+08:00', endDate: '2026-10-01T00:00:00Z' },
  ])('accepts ordered date representations without changing their values: %j', (dates) => {
    const request = createSellerSpriteAdsHighFrequencyRequest('ads-request', 'sellersprite', { ...highFrequency, ...dates, orderField: 'keyword' })
    expect(isSellerSpriteAdsHighFrequencyRequest(request)).toBe(true)
    expect(request.payload.input).toMatchObject(dates)
  })
})

describe('SellerSprite advertising responses', () => {
  it.each(responseCases)('accepts minimized $name data and observed empty arrays', ({ action, guard, data, empty }) => {
    expect(guard(response(action, data))).toBe(true)
    expect(guard(response(action, empty))).toBe(true)
    expect(guard(response(action, { ...data, raw: {} }))).toBe(false)
    expect(guard({ ...response(action, data), action: 'UNKNOWN' })).toBe(false)
    expect(guard({ ...response(action, data), requestId: undefined })).toBe(false)
    expect(guard({ ...response(action, data), protocolVersion: 2 })).toBe(false)
  })

  it.each(responseCases)('rejects malformed and untrimmed $name data', ({ action, guard, invalid }) => {
    for (const data of invalid) expect(guard(response(action, data)), JSON.stringify(data)).toBe(false)
  })

  it('accepts brief campaign lists while preserving missing counts and lists as null', () => {
    expect(isSellerSpriteAdsInsightsResponse(response('SELLERSPRITE_ADS_INSIGHTS', {
      adCount: null, campaignCount: null, sp: null, spv: null, groups: null,
      campaigns: [{ campaignId: 'campaign-1', type: 'SPV' }], adIdList: null, variations: null,
    }))).toBe(true)
  })

  it('accepts null or nonnegative integer counts and rejects invalid architecture counts', () => {
    for (const field of ['adCount', 'campaignCount', 'sp', 'spv']) {
      for (const value of [null, 0, Number.MAX_SAFE_INTEGER]) {
        expect(isSellerSpriteAdsInsightsResponse(response('SELLERSPRITE_ADS_INSIGHTS', { ...insightsData, [field]: value }))).toBe(true)
      }
      for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
        expect(isSellerSpriteAdsInsightsResponse(response('SELLERSPRITE_ADS_INSIGHTS', { ...insightsData, [field]: value })), field).toBe(false)
      }
    }
    expect(isSellerSpriteAdsHistoryResponse(response('SELLERSPRITE_ADS_HISTORY', { periods: [{ ...period, keywordsCount: 0 }] }))).toBe(true)
    expect(isSellerSpriteAdsKeywordsResponse(response('SELLERSPRITE_ADS_KEYWORDS', {
      ...keywordData, items: [{ ...keyword, marketId: 1, searches: 0, impressions: 0, clicks: 0 }],
    }))).toBe(true)
  })

  it.each(responseCases)('preserves protocol failures instead of presenting empty $name data', ({ guard }) => {
    const error = {
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1, requestId: 'ads-request',
      ok: false, error: { code: 'TARGET_NOT_LOGGED_IN', httpStatus: 401 },
    }
    expect(guard(error)).toBe(true)
    expect(guard({ ...error, error: {} })).toBe(false)
    expect(guard({ ...error, requestId: '' })).toBe(false)
  })
})
