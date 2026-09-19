import { describe, expect, it, vi } from 'vitest'
import { ResearchPortError, type ProductCandidate, type ResearchPorts } from '@cookie-amazon/research-core'
import { WebSdkError } from '@cookie-amazon/web-sdk'
import { createSellerSpriteResearchPorts, toResearchPortError } from './create-research-ports'
import { categoryOptionLabel, filterLeafCategories } from './AutoResearchPanel'
import { createAutoResearchRunner } from './use-auto-research'
import { SELLERSPRITE_RECORDED_LEAF_CATEGORIES } from '../sellersprite-category-catalog'

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
    const selectProducts = vi.fn(async (request: { page: number }) => ({
      page: request.page,
      pages: 5,
      size: 60,
      total: 300,
      hasNextPage: request.page < 5,
      items: [protocolCandidate],
    }))
    const reverseKeywords = vi.fn(async () => ({
      asin: 'B000000001', total: 1, items: [{
        keywords: 'portable stand', searches: 1_000, products: 500, supplyDemandRatio: 0.5,
        trafficPercentage: 0.8, purchaseRate: 0.12, bid: null, bidMin: null, bidMax: null,
        avgPrice: 25, avgRating: 4.5, avgReviews: 50,
        natural: null, ad: null, naturalRatio: null, adRatio: null, positionTypes: null,
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

    const leafPath = '7141123011:7586165011:14194728011:14194729011:14194730011'
    const candidates = await ports.products.discover({ market: 'US', categoryId: leafPath })
    const candidatePage = await ports.products.discoverPage?.({ market: 'US', categoryId: leafPath }, 3)
    const expandedPage = await ports.products.discoverPage?.({ market: 'US', categoryId: leafPath, discoveryProfile: 'expanded' }, 1)
    const keywords = await ports.reverseKeywords.reverse('B000000001', 'US')
    const reviews = await ports.reviews?.list('B000000001', 'US', { stars: [1, 2, 3] })

    expect(candidates[0]).toMatchObject({ asin: 'B000000001', discoveryScore: expect.any(Number), listingAgeDays: 120 })
    expect(candidatePage).toMatchObject({ page: 3, pages: 5, total: 300, hasNextPage: true, items: [expect.objectContaining({ asin: 'B000000001' })] })
    expect(expandedPage).toMatchObject({ page: 1, items: [expect.objectContaining({ asin: 'B000000001' })] })
    expect(keywords[0]).toMatchObject({ keyword: 'portable stand', rank: 4, relevancy: 0.8 })
    expect(reviews?.[0]).toEqual({ asin: 'B000000001', star: 2, title: 'Broken', content: 'Poor quality', variation: ['Black'], likes: 1 })
    expect(selectProducts).toHaveBeenCalledWith(expect.objectContaining({ market: 'US', nodeIdPaths: [leafPath], page: 1 }), expect.anything())
    expect(selectProducts).toHaveBeenCalledWith(expect.objectContaining({ market: 'US', nodeIdPaths: [leafPath], page: 3, minRanking: '10000', maxSales: '300' }), expect.anything())
    expect(selectProducts).toHaveBeenCalledWith(expect.objectContaining({
      market: 'US', nodeIdPaths: [leafPath], page: 1, minRanking: '', maxRanking: '', maxSales: '', maxPrice: '', maxSellers: '',
    }), expect.anything())
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

describe('leaf category search', () => {
  it('matches leaf names and parent paths without merging duplicate leaf categories', () => {
    const hats = filterLeafCategories(SELLERSPRITE_RECORDED_LEAF_CATEGORIES, '帽子')
    const womenAccessories = filterLeafCategories(SELLERSPRITE_RECORDED_LEAF_CATEGORIES, 'Women:Accessories')

    expect(hats.length).toBeGreaterThan(1)
    expect(new Set(hats.map((item) => item.id)).size).toBe(hats.length)
    expect(new Set(hats.map(categoryOptionLabel)).size).toBe(hats.length)
    expect(hats.every((item) => categoryOptionLabel(item).includes('>'))).toBe(true)
    expect(womenAccessories.some((item) => item.labelLocale === '帽子')).toBe(true)
  })

  it('restores the full category list when the search is cleared', () => {
    expect(filterLeafCategories(SELLERSPRITE_RECORDED_LEAF_CATEGORIES, '  ')).toEqual(SELLERSPRITE_RECORDED_LEAF_CATEGORIES)
    expect(filterLeafCategories(SELLERSPRITE_RECORDED_LEAF_CATEGORIES, '不存在的类目路径')).toEqual([])
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
