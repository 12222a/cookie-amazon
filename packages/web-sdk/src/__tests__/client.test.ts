import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  setNamespace: vi.fn(),
}))

vi.mock('webext-bridge/window', () => bridge)

import { mineSellerSpriteKeywords, reverseSellerSpriteKeywords, selectSellerSpriteProducts } from '../client'

const input = {
  market: 'US', ac: false, asin: 'B000000000', badges: [], conversionKeywordTypes: [],
  desc: true, exactly: false, filterDeletedKeywords: false, keywordBidMatchType: 'broad',
  limit: 20, month: '2026-01', order: 'searches', skip: 0, trafficKeywordTypes: [],
}

const productSelectionInput = {
  eligibility: [], filterSub: false, lowPrice: 'N' as const, market: 'US', monthName: 'bsr_sales_nearly',
  nodeIdPaths: [], order: { desc: true, field: 'amz_unit' }, page: 1, pkgDimensionTypeList: [],
  productTags: [], salesGrowthType: '30d' as const, selectType: 2 as const, sellerNationList: [],
  sellerTypes: [], size: 20, symbolFlag: false, video: '' as const, weightUnit: 'g' as const,
}

const keywordMiningInput = {
  amazonChoice: false, desc: true, filterRootWord: false, historyDate: '2026-01',
  keyword: 'wireless earbuds', keywordBidMatchType: 'broad', market: 'US', matchType: 'BROAD',
  orderBy: 'searches', pageNum: 1, pageSize: 20,
}

describe('SellerSprite web SDK', () => {
  beforeEach(() => {
    bridge.sendMessage.mockReset()
    bridge.setNamespace.mockClear()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { origin: 'http://localhost:5173' },
        setTimeout,
        clearTimeout,
      },
    })
  })

  it('sends the strict keyword reverse request and returns minimized data', async () => {
    const data = { asin: 'B000000000', items: [] }
    bridge.sendMessage.mockResolvedValue({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'SELLERSPRITE_KEYWORD_REVERSE', ok: true, data,
    })

    await expect(reverseSellerSpriteKeywords(input)).resolves.toEqual(data)
    expect(bridge.sendMessage).toHaveBeenCalledTimes(1)
    const [action, request, destination] = bridge.sendMessage.mock.calls[0]!
    expect(action).toBe('SELLERSPRITE_KEYWORD_REVERSE')
    expect(destination).toBe('content-script')
    expect(request).toMatchObject({
      namespace: 'cookie-amazon-platform', kind: 'request', protocolVersion: 1,
      action: 'SELLERSPRITE_KEYWORD_REVERSE',
      payload: { targetId: 'sellersprite', input },
    })
  })

  it('sends the product selection request and returns minimized paginated data', async () => {
    const data = { page: 1, pages: 5, size: 20, total: 100, hasNextPage: true, items: [] }
    bridge.sendMessage.mockResolvedValue({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'PRODUCT_SELECTION', ok: true, data,
    })

    await expect(selectSellerSpriteProducts(productSelectionInput)).resolves.toEqual(data)
    const [action, request, destination] = bridge.sendMessage.mock.calls[0]!
    expect(action).toBe('PRODUCT_SELECTION')
    expect(destination).toBe('content-script')
    expect(request).toMatchObject({
      action: 'PRODUCT_SELECTION',
      payload: { targetId: 'sellersprite', input: productSelectionInput },
    })
  })

  it('sends the keyword mining request and surfaces protocol error codes', async () => {
    bridge.sendMessage.mockResolvedValue({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'KEYWORD_MINING', ok: false,
      error: { code: 'OPERATION_DISABLED' },
    })

    await expect(mineSellerSpriteKeywords(keywordMiningInput)).rejects.toMatchObject({ code: 'OPERATION_DISABLED' })
    const [action, request] = bridge.sendMessage.mock.calls[0]!
    expect(action).toBe('KEYWORD_MINING')
    expect(request).toMatchObject({
      action: 'KEYWORD_MINING',
      payload: { targetId: 'sellersprite', input: keywordMiningInput },
    })
  })

  it('rejects when the extension bridge is unavailable', async () => {
    bridge.sendMessage.mockRejectedValue(new Error('no receiver'))
    await expect(selectSellerSpriteProducts(productSelectionInput)).rejects.toMatchObject({ code: 'EXTENSION_UNAVAILABLE' })
  })
})