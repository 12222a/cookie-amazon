import { describe, expect, it, vi } from 'vitest'
import { ResearchPortError, type ProductCandidate, type ResearchPorts } from '@cookie-amazon/research-core'
import { WebSdkError } from '@cookie-amazon/web-sdk'
import { createSellerSpriteResearchPorts, toResearchPortError } from './create-research-ports'
import { createAutoResearchRunner } from './use-auto-research'

const protocolCandidate = {
  asin: 'B000000001',
  title: 'Portable stand',
  brand: 'Example',
  imageUrl: null,
  price: 25,
  rating: 4.5,
  reviews: 50,
  estimatedSales: 200,
  availableDate: null,
  availableDays: 120,
  salesGrowth: 15,
  salesGrowthYoy: null,
  revenue: null,
  bsrRank: 20_000,
  sellers: 1,
  categoryName: 'Office',
  nodeLabelPath: 'Office',
}

describe('SellerSprite research ports', () => {
  it('maps product discovery, reverse keywords and review filters to domain evidence', async () => {
    const selectProducts = vi.fn(async () => ({ page: 1, pages: 1, size: 60, total: 1, hasNextPage: false, items: [protocolCandidate] }))
    const reverseKeywords = vi.fn(async () => ({
      asin: 'B000000001', total: 1, items: [{
        keywords: 'portable stand', searches: 1_000, products: 500, supplyDemandRatio: 0.5,
        trafficPercentage: 0.8, purchaseRate: 0.12, bid: null, bidMin: null, bidMax: null,
        avgPrice: 25, avgRating: 4.5, avgReviews: 50,
        searchesTrend: [{ month: '2026-08', searchRank: 4, searches: 1_000 }],
      }],
    }))
    const listReviews = vi.fn(async () => ({
      page: 1, size: 20, total: 1, took: 2, items: [{
        id: 'review-1', asin: 'B000000001', parent: null, date: 1,
        title: 'Broken', titleCn: null, content: 'Poor quality', contentCn: null,
        star: 2, skus: ['Black'], likes: 1, images: [], verified: true, vine: false,
      }],
    }))
    const ports = createSellerSpriteResearchPorts({ selectProducts, reverseKeywords, listReviews })

    const candidates = await ports.products.discover({ market: 'US', categoryId: '123' })
    const keywords = await ports.reverseKeywords.reverse('B000000001', 'US')
    const reviews = await ports.reviews?.list('B000000001', 'US', { stars: [1, 2, 3] })

    expect(candidates[0]).toMatchObject({ asin: 'B000000001', discoveryScore: expect.any(Number), listingAgeDays: 120 })
    expect(keywords[0]).toMatchObject({ keyword: 'portable stand', rank: 4, relevancy: 0.8 })
    expect(reviews?.[0]).toEqual({ asin: 'B000000001', star: 2, title: 'Broken', content: 'Poor quality', variation: ['Black'], likes: 1 })
    expect(selectProducts).toHaveBeenCalledWith(expect.objectContaining({ market: 'US', nodeIdPaths: ['123'], page: 1 }), expect.anything())
    expect(listReviews).toHaveBeenCalledWith(expect.objectContaining({ asin: 'B000000001', starList: [1, 2, 3], pageNum: 1 }), expect.anything())
  })

  it('maps SDK failures into classified, minimized domain errors', () => {
    expect(toResearchPortError(new WebSdkError('TARGET_NOT_LOGGED_IN'))).toMatchObject({ kind: 'authentication', fatal: true, message: 'TARGET_NOT_LOGGED_IN' })
    expect(toResearchPortError(new WebSdkError('TARGET_RATE_LIMITED', {
      httpStatus: 429, targetCode: 'QUOTA_EXCEEDED', targetMessage: ' 查询次数\n已用完 ',
    }))).toMatchObject({
      kind: 'rate-limit', fatal: false,
      message: 'TARGET_RATE_LIMITED · HTTP 429 · 上游码 QUOTA_EXCEEDED · 查询次数 已用完',
    })
    expect(toResearchPortError(new WebSdkError('TARGET_RESPONSE_INVALID'))).toMatchObject({ kind: 'contract', fatal: true })
  })
})

const candidate = (asin: string): ProductCandidate => ({
  asin,
  title: asin,
  brand: null,
  imageUrl: null,
  estimatedSales: 100,
  salesGrowth: null,
  price: 20,
  rating: 4,
  reviews: 10,
  sellers: 1,
  discoveryScore: 70,
})

describe('auto research runner', () => {
  it('suppresses stale updates and results when a newer task starts', async () => {
    let resolveFirst: ((value: ProductCandidate[]) => void) | null = null
    let discoveryCall = 0
    const ports: ResearchPorts = {
      products: {
        discover: async () => {
          discoveryCall += 1
          if (discoveryCall === 1) return new Promise<ProductCandidate[]>((resolve) => { resolveFirst = resolve })
          return [candidate('B000000002')]
        },
      },
      reverseKeywords: { reverse: async () => [] },
    }
    const runner = createAutoResearchRunner(ports)
    const firstUpdates: string[] = []
    const secondUpdates: string[] = []
    const first = runner.start({ market: 'US', categoryId: 'old' }, (job) => firstUpdates.push(`${job.currentStage}:${job.status}`))
    const second = runner.start({ market: 'US', categoryId: 'new' }, (job) => secondUpdates.push(`${job.currentStage}:${job.status}`))

    const secondResult = await second
    const resolve = resolveFirst as ((value: ProductCandidate[]) => void) | null
    if (!resolve) throw new Error('first discovery did not start')
    resolve([candidate('B000000001')])
    const firstResult = await first

    expect(secondResult?.input.categoryId).toBe('new')
    expect(firstResult).toBeNull()
    expect(firstUpdates).toEqual(['discovery:running', 'discovery:running'])
    expect(secondUpdates.at(-1)).toBe('null:partial')
    runner.dispose()
  })

  it('keeps existing ResearchPortError classifications', () => {
    const error = new ResearchPortError('permission', 'TARGET_PERMISSION_MISSING')
    expect(toResearchPortError(error)).toBe(error)
  })
})