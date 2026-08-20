import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  setNamespace: vi.fn(),
}))

vi.mock('webext-bridge/window', () => bridge)

import { listSellerSpriteAbaPeriods, mineSellerSpriteKeywords, readSellerSpriteMonthly, researchSellerSpriteAba, researchSellerSpriteMarket, reverseSellerSpriteKeywords, selectSellerSpriteProducts } from '../client'

const input = {
  asin: 'B000000000', marketId: 1, month: '2026-01', forceReStat: false, badges: [], limit: 20,
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
    const data = { asin: 'B000000000', total: 0, items: [] }
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

  it('sends monthly ASIN requests through the strict bridge contract', async () => {
    const data = { historyStatus: 'not-verified', variations: [] }
    bridge.sendMessage.mockResolvedValue({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'SELLERSPRITE_MONTHLY', ok: true, data,
    })

    const monthlyInput = { asin: 'B000000000', month: '', station: 'US' }
    await expect(readSellerSpriteMonthly(monthlyInput)).resolves.toEqual(data)
    expect(bridge.sendMessage.mock.calls[0]).toMatchObject([
      'SELLERSPRITE_MONTHLY',
      { action: 'SELLERSPRITE_MONTHLY', payload: { targetId: 'sellersprite', input: monthlyInput } },
      'content-script',
    ])
  })

  it('sends strict market research input and accepts minimized rows only', async () => {
    const data = {
      rows: [],
      fieldCoverage: {
        sampleCounts: 0, totalSales: 0, averageSales: 0, averageRevenue: 0, rating: 0,
        bsr: 0, price: 0, sellerTypes: 0, concentration: 0, newProducts: 0,
        totalProducts: 0, profit: 0,
      },
      profitStatus: 'not-integrated',
    }
    bridge.sendMessage.mockResolvedValue({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'SELLERSPRITE_MARKET_RESEARCH', ok: true, data,
    })
    const marketInput = {
      marketId: 1 as const,
      departmentKeyword: 'phone stand',
      monthName: 'bsr_sales_nearly' as const,
      newReleaseNum: 3 as const,
    }
    await expect(researchSellerSpriteMarket(marketInput)).resolves.toEqual(data)
    expect(bridge.sendMessage.mock.calls[0]).toMatchObject([
      'SELLERSPRITE_MARKET_RESEARCH',
      { action: 'SELLERSPRITE_MARKET_RESEARCH', payload: { targetId: 'sellersprite', input: marketInput } },
      'content-script',
    ])
  })

  it('lists ABA periods and sends strict monthly ABA pagination requests', async () => {
    const periods = {
      weekTables: [{ table: 'ara_20260815', label: '20260815' }],
      monthTables: [{ table: 'ara_202607', label: '202607' }],
    }
    bridge.sendMessage.mockResolvedValueOnce({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'SELLERSPRITE_ABA_PERIODS', ok: true, data: periods,
    })
    await expect(listSellerSpriteAbaPeriods()).resolves.toEqual(periods)
    expect(bridge.sendMessage.mock.calls[0]).toMatchObject([
      'SELLERSPRITE_ABA_PERIODS',
      { action: 'SELLERSPRITE_ABA_PERIODS', payload: { targetId: 'sellersprite' } },
      'content-script',
    ])

    const input = {
      reverseType: 'M' as const, table: 'ara_202607', q: 'screen protector',
      market: 'COM' as const, page: 2, size: 50,
    }
    const data = { page: 2, pages: 90, size: 50, total: 4490, took: 46, hasNextPage: true, items: [] }
    bridge.sendMessage.mockResolvedValueOnce({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'SELLERSPRITE_ABA_RESEARCH', ok: true, data,
    })
    await expect(researchSellerSpriteAba(input)).resolves.toEqual(data)
    expect(bridge.sendMessage.mock.calls[1]).toMatchObject([
      'SELLERSPRITE_ABA_RESEARCH',
      { action: 'SELLERSPRITE_ABA_RESEARCH', payload: { targetId: 'sellersprite', input } },
      'content-script',
    ])
  })

  it('rejects invalid ABA input before using the extension bridge', async () => {
    await expect(researchSellerSpriteAba({
      reverseType: 'M', table: 'ara_20260815', q: 'screen protector', market: 'COM', page: 1, size: 50,
    })).rejects.toMatchObject({ code: 'INVALID_MESSAGE' })
    expect(bridge.sendMessage).not.toHaveBeenCalled()
  })

  it('surfaces SellerSprite ABA error code and message', async () => {
    bridge.sendMessage.mockResolvedValue({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'SELLERSPRITE_ABA_RESEARCH', ok: false,
      error: { code: 'TARGET_API_ERROR', targetCode: 'QUOTA_EXCEEDED', targetMessage: '查询次数已用完' },
    })
    await expect(researchSellerSpriteAba({
      reverseType: 'W', table: 'ara_20260815', q: 'screen protector', market: 'COM', page: 1, size: 50,
    })).rejects.toMatchObject({
      code: 'TARGET_API_ERROR', targetCode: 'QUOTA_EXCEEDED', targetMessage: '查询次数已用完',
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