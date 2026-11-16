import { describe, expect, it, vi } from 'vitest'
import type { SellerSpriteAdsInsightsInput, SellerSpriteAdsKeywordsInput } from '@cookie-amazon/protocol'
import { TargetClient } from '../client'
import { resolveRuntimeTargetPolicy } from '../runtime-policy'
import {
  SELLERSPRITE_ADAPTER, lookupSellerSpriteAdsInsights, listSellerSpriteAdsHistory,
  listSellerSpriteAdsKeywords, listSellerSpriteAdsHighFrequency,
} from '../sellersprite'

const insights: SellerSpriteAdsInsightsInput = {
  asin: 'B0F9XY6HXB', market: 1, interval: 'week', months: 6, desc: false,
  pageNum: 1, pageSize: 20, orderByEffectiveness: false, type: '', campaignId: '',
  adId: '', variation: '', combination: false, brief: false,
}
const history = { asin: insights.asin, market: 1, interval: 'week' as const, months: 6 as const, adId: 'complete-group-id' }
const keywords: SellerSpriteAdsKeywordsInput = {
  adId: history.adId, market: 1, interval: 'week', beginDate: '2026-09-01', endDate: '2026-09-07',
  pageNum: 1, pageSize: 50, keyword: '', orderField: 'updatedTime', desc: true,
}
const { pageNum: _page, pageSize: _size, ...highFrequency } = keywords
const period = { beginDate: '2026-09-01', endDate: '2026-09-07', keywordsCount: '5', private: 'discard' }
const group = { adId: history.adId, campaignId: 'complete-campaign-id', asin: insights.asin, type: 'SP', history: [period], private: 'discard' }
const fixture = (data: unknown) => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ code: 'OK', data, private: 'discard' })))
  return { fetcher, client: new TargetClient(SELLERSPRITE_ADAPTER, fetcher) }
}

describe('SellerSprite advertising session endpoints', () => {
  it('keeps full identifiers, reported totals and periods while projecting confirmed fields', async () => {
    const { client, fetcher } = fixture({ adCount: '60', campaignCount: 3, sp: 58, spv: 2, groups: [group] })
    const data = await lookupSellerSpriteAdsInsights(client, { ...insights, type: 'SPV' })
    expect(data).toEqual({
      adCount: 60, campaignCount: 3, sp: 58, spv: 2,
      groups: [{ adId: history.adId, campaignId: group.campaignId, asin: insights.asin, asinImage: null, type: 'SP', history: [{ beginDate: period.beginDate, endDate: period.endDate, keywordsCount: 5 }] }],
      campaigns: null, adIdList: null, variations: null,
    })
    expect(JSON.stringify(data)).not.toContain('private')
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit]
    expect(new URL(String(url)).pathname).toBe('/v3/api/xds/stat')
    expect(new URL(String(url)).searchParams.get('type')).toBe('SPV')
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
    expect(init.headers).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it('supports brief filter options without inventing counts or groups', async () => {
    const { client, fetcher } = fixture({ campaigns: [{ campaignId: 'campaign', type: 'SP', secret: 'discard' }], adIdList: [history.adId], variations: [insights.asin] })
    const data = await lookupSellerSpriteAdsInsights(client, { ...insights, brief: true })
    expect(data).toEqual({ adCount: null, campaignCount: null, sp: null, spv: null, groups: null, campaigns: [{ campaignId: 'campaign', type: 'SP' }], adIdList: [history.adId], variations: [insights.asin] })
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('brief')).toBe('true')
  })

  it('reads available periods from the history array', async () => {
    const { client, fetcher } = fixture([period])
    expect(await listSellerSpriteAdsHistory(client, history)).toEqual({ periods: [{ beginDate: period.beginDate, endDate: period.endDate, keywordsCount: 5 }] })
    const url = new URL(String(fetcher.mock.calls[0]![0]))
    expect(url.pathname).toBe('/v3/api/xds/stat/history')
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...history, market: '1', months: '6' })
  })

  it('uses the upstream keyword total for pagination and preserves unavailable metrics as null', async () => {
    const { client, fetcher } = fixture({ total: '60', items: [{ keyword: 'halloween blanket', searches: '1,200', private: 'discard' }] })
    const data = await listSellerSpriteAdsKeywords(client, keywords)
    expect(data).toEqual({ pageNum: 1, pageSize: 50, total: 60, hasNextPage: true, items: [{
      keyword: 'halloween blanket', keywordCn: null, keywordJp: null, asin: null, marketId: null,
      searchesRank: null, searches: 1200, impressions: null, clicks: null, cprExact: null, adProducts: null,
    }] })
    const url = new URL(String(fetcher.mock.calls[0]![0]))
    expect(url.pathname).toBe('/v3/api/xds/stat/keyword')
    expect(url.searchParams.get('beginDate')).toBe(keywords.beginDate)
    expect(url.searchParams.get('orderField')).toBe('updatedTime')
    expect(url.searchParams.get('pageSize')).toBe('50')
  })

  it('reads high-frequency words with no pagination parameters', async () => {
    const { client, fetcher } = fixture([{ keywords: 'blanket', total: '12', secret: 'discard' }])
    expect(await listSellerSpriteAdsHighFrequency(client, highFrequency)).toEqual({ items: [{ keyword: 'blanket', total: 12 }] })
    const url = new URL(String(fetcher.mock.calls[0]![0]))
    expect(url.pathname).toBe('/v3/api/xds/stat/keyword/high-frequency')
    expect(url.searchParams.has('pageNum')).toBe(false)
    expect(url.searchParams.has('pageSize')).toBe(false)
  })

  it('accepts explicit empty results from all four endpoints', async () => {
    expect((await lookupSellerSpriteAdsInsights(fixture({ groups: [], adCount: 0 }).client, insights)).groups).toEqual([])
    expect(await listSellerSpriteAdsHistory(fixture([]).client, history)).toEqual({ periods: [] })
    expect(await listSellerSpriteAdsKeywords(fixture({ total: 0, items: [] }).client, keywords)).toMatchObject({ total: 0, items: [], hasNextPage: false })
    expect(await listSellerSpriteAdsHighFrequency(fixture([]).client, highFrequency)).toEqual({ items: [] })
  })

  it('rejects missing data instead of reporting no advertising', async () => {
    await expect(lookupSellerSpriteAdsInsights(fixture({}).client, insights)).rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })
    await expect(listSellerSpriteAdsHistory(fixture(null).client, history)).rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })
    await expect(listSellerSpriteAdsKeywords(fixture({ items: [] }).client, keywords)).rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })
    await expect(listSellerSpriteAdsHighFrequency(fixture({}).client, highFrequency)).rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })
  })

  it.each([
    [401, '{}', 'TARGET_NOT_LOGGED_IN'],
    [200, JSON.stringify({ code: 'ERR_GLOBAL_SESSION_EXPIRED' }), 'TARGET_NOT_LOGGED_IN'],
    [429, '{}', 'TARGET_RATE_LIMITED'],
    [200, JSON.stringify({ code: 'ERR_QUOTA', message: 'quota' }), 'TARGET_API_ERROR'],
    [200, '<html>not json</html>', 'TARGET_RESPONSE_INVALID'],
  ])('preserves shared session and upstream failures (%s)', async (status, body, code) => {
    const client = new TargetClient(SELLERSPRITE_ADAPTER, async () => new Response(body, { status }))
    await expect(lookupSellerSpriteAdsInsights(client, insights)).rejects.toMatchObject({ code })
  })

  it('rejects unknown fields and invalid inputs before any request', () => {
    const { client, fetcher } = fixture({})
    expect(() => lookupSellerSpriteAdsInsights(client, { ...insights, url: 'https://invalid.example' } as SellerSpriteAdsInsightsInput)).toThrow('TARGET_API_ERROR')
    expect(() => listSellerSpriteAdsHistory(client, { ...history, adId: '' })).toThrow('TARGET_API_ERROR')
    expect(() => listSellerSpriteAdsKeywords(client, { ...keywords, beginDate: '2026-10-01' })).toThrow('TARGET_API_ERROR')
    expect(() => listSellerSpriteAdsHighFrequency(client, { ...highFrequency, pageNum: 1 } as typeof highFrequency)).toThrow('TARGET_API_ERROR')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps advertising actions subject to compiled policy and runtime disablement', async () => {
    const { fetcher } = fixture({ groups: [] })
    const client = new TargetClient(SELLERSPRITE_ADAPTER, fetcher, { SELLERSPRITE_ADS_INSIGHTS: { enabled: false } })
    await expect(lookupSellerSpriteAdsInsights(client, insights)).rejects.toMatchObject({ code: 'OPERATION_DISABLED' })
    const changedPath = new TargetClient(SELLERSPRITE_ADAPTER, fetcher, { SELLERSPRITE_ADS_HISTORY: { path: '/api/arbitrary' } })
    await expect(listSellerSpriteAdsHistory(changedPath, history)).rejects.toMatchObject({ code: 'TARGET_OPERATION_UNKNOWN' })
    expect(resolveRuntimeTargetPolicy(SELLERSPRITE_ADAPTER, null).capabilities).toContain('SELLERSPRITE_ADS_HIGH_FREQUENCY')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
