import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  setNamespace: vi.fn(),
}))

vi.mock('webext-bridge/window', () => bridge)

import { getExtensionStatus, listSellerSpriteAbaPeriods, listSellerSpriteCategoryNodes, listSellerSpriteReviewComments, mineSellerSpriteKeywords, readSellerSpriteMonthly, researchSellerSpriteAba, researchSellerSpriteCompetitors, researchSellerSpriteMarket, reverseSellerSpriteKeywords, selectSellerSpriteProducts, SELLERSPRITE_SESSION_EXPIRED_EVENT } from '../client'

const input = {
  asin: 'B000000000', marketId: 1, month: '2026-01', forceReStat: false, badges: [], limit: 20,
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

const competitorInput = {
  asins: [], keywords: 'phone stand', brand: '', seller: '', lowPrice: 'N' as const,
  market: 'US', monthName: 'bsr_sales_nearly', nodeIdPaths: [],
  order: { desc: true, field: 'amz_unit' }, page: 1, size: 20, symbolFlag: false,
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
        dispatchEvent: vi.fn(),
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

  it('preserves safe keyword reverse error details', async () => {
    bridge.sendMessage.mockResolvedValue({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'SELLERSPRITE_KEYWORD_REVERSE', ok: false,
      error: { code: 'TARGET_API_ERROR', httpStatus: 400, targetCode: 'INVALID_ASIN', targetMessage: 'ASIN 参数无效' },
    })

    await expect(reverseSellerSpriteKeywords(input)).rejects.toMatchObject({
      code: 'TARGET_API_ERROR', httpStatus: 400, targetCode: 'INVALID_ASIN', targetMessage: 'ASIN 参数无效',
    })
  })

  it('notifies the page immediately when a business request reports an expired session', async () => {
    bridge.sendMessage.mockResolvedValue({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'SELLERSPRITE_KEYWORD_REVERSE', ok: false,
      error: { code: 'TARGET_NOT_LOGGED_IN', httpStatus: 200, targetMessage: 'SellerSprite 登录已失效' },
    })

    await expect(reverseSellerSpriteKeywords(input)).rejects.toMatchObject({ code: 'TARGET_NOT_LOGGED_IN' })
    const dispatchEvent = window.dispatchEvent as unknown as ReturnType<typeof vi.fn>
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({ type: SELLERSPRITE_SESSION_EXPIRED_EVENT })
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

  it('preserves competitor and market contract diagnostics across the bridge', async () => {
    const diagnostic = '接口 竞品查询 POST /v3/api/competing-lookup；阶段 竞品研究响应合同；HTTP 200；Content-Type application/json；响应长度 321；响应分页字段 data.pages 缺失或类型无效；摘要 envelope=[code,data] data=object[page,size,total,items]'
    bridge.sendMessage.mockResolvedValueOnce({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', ok: false,
      error: { code: 'TARGET_RESPONSE_INVALID', httpStatus: 200, targetCode: 'OK', targetMessage: diagnostic },
    })

    await expect(researchSellerSpriteCompetitors(competitorInput)).rejects.toMatchObject({
      code: 'TARGET_RESPONSE_INVALID', httpStatus: 200, targetCode: 'OK', targetMessage: diagnostic,
    })

    bridge.sendMessage.mockResolvedValueOnce({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', ok: false,
      error: {
        code: 'TARGET_RESPONSE_INVALID', httpStatus: 200,
        targetMessage: '接口 市场研究 POST /v2/market-research；阶段 市场研究 HTML 合同；HTTP 200；Content-Type text/html；响应长度 861428；市场研究表头不匹配（列数 14）',
      },
    })
    await expect(researchSellerSpriteMarket({
      marketId: 1, departmentKeyword: 'phone stand', monthName: 'bsr_sales_nearly', newReleaseNum: 3,
    })).rejects.toMatchObject({
      code: 'TARGET_RESPONSE_INVALID', httpStatus: 200,
      targetMessage: expect.stringContaining('市场研究 HTML 合同'),
    })
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

  it('sends strict category and review requests through the bridge', async () => {
    const categoryData = { parent: null, items: [] }
    bridge.sendMessage.mockResolvedValueOnce({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'SELLERSPRITE_CATEGORY_NODES', ok: true, data: categoryData,
    })
    const categoryInput = { marketld: 1, table: 'bsr_sales_nearly' as const }
    await expect(listSellerSpriteCategoryNodes(categoryInput)).resolves.toEqual(categoryData)
    expect(bridge.sendMessage.mock.calls[0]).toMatchObject([
      'SELLERSPRITE_CATEGORY_NODES',
      { action: 'SELLERSPRITE_CATEGORY_NODES', payload: { targetId: 'sellersprite', input: categoryInput } },
      'content-script',
    ])

    const reviewData = { page: 1, size: 20, total: 0, took: 0, items: [] }
    bridge.sendMessage.mockResolvedValueOnce({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'SELLERSPRITE_REVIEW_COMMENTS', ok: true, data: reviewData,
    })
    const reviewInput = {
      asin: 'B08H26Z7D9', keyword: '' as const, market: 'US', pageNum: 1, pageSize: 20,
      reviewEndTime: null, reviewStartTime: null, order: { fieldName: 'date' as const, sort: 1 as const },
      starList: [], typeList: [], variations: [],
    }
    await expect(listSellerSpriteReviewComments(reviewInput)).resolves.toEqual(reviewData)
    expect(bridge.sendMessage.mock.calls[1]).toMatchObject([
      'SELLERSPRITE_REVIEW_COMMENTS',
      { action: 'SELLERSPRITE_REVIEW_COMMENTS', payload: { targetId: 'sellersprite', input: reviewInput } },
      'content-script',
    ])
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

  it('times out when the legacy bridge promise never settles', async () => {
    bridge.sendMessage.mockReturnValue(new Promise(() => {}))
    await expect(getExtensionStatus({ timeoutMs: 20 })).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('rejects when the extension bridge is unavailable', async () => {
    bridge.sendMessage.mockRejectedValue(new Error('no receiver'))
    await expect(selectSellerSpriteProducts(productSelectionInput)).rejects.toMatchObject({ code: 'EXTENSION_UNAVAILABLE' })
  })
})