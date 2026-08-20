import { describe, expect, it, vi } from 'vitest'
import type { SellerSpriteCompetitorData, SellerSpriteKeywordReverseData } from '@cookie-amazon/protocol'
import { prepareKeywordLookup } from './keyword-lookup'

const competitorData = (asins: string[]): SellerSpriteCompetitorData => ({
  page: 1, pages: 1, size: asins.length, total: asins.length, hasNextPage: false,
  items: asins.map((asin, index) => ({
    asin, title: null, brand: null, imageUrl: null, price: null, rating: null,
    reviews: null, estimatedSales: 100 - index, availableDate: null, availableDays: null,
  })),
})

const keywordData = (asin: string): SellerSpriteKeywordReverseData => ({ asin, total: 0, items: [] })

describe('keyword lookup orchestration', () => {
  it('limits the lookup to three ASINs and executes strictly serially', async () => {
    const calls: string[] = []
    let active = 0
    const reverse = vi.fn(async ({ asin }: { asin: string }) => {
      expect(active).toBe(0)
      active += 1
      calls.push(asin)
      await Promise.resolve()
      active -= 1
      return keywordData(asin)
    })
    const job = prepareKeywordLookup(competitorData([
      'B000000001', 'B000000002', 'B000000003', 'B000000004',
    ]), 'US', reverse)

    expect(job.initialState).toMatchObject({ status: 'loading', attemptedAsinCount: 3 })
    await expect(job.run()).resolves.toMatchObject({
      state: { status: 'complete', successfulAsinCount: 3 },
    })
    expect(calls).toEqual(['B000000001', 'B000000002', 'B000000003'])
  })

  it('isolates one failed ASIN and marks unsupported markets without requests', async () => {
    const reverse = vi.fn(async ({ asin }: { asin: string }) => {
      if (asin === 'B000000002') throw new Error('quota')
      return keywordData(asin)
    })
    const job = prepareKeywordLookup(competitorData([
      'B000000001', 'B000000002', 'B000000003',
    ]), 'US', reverse)
    await expect(job.run()).resolves.toMatchObject({
      state: { status: 'partial', attemptedAsinCount: 3, successfulAsinCount: 2 },
    })

    const unsupported = prepareKeywordLookup(competitorData(['B000000001']), 'JP', reverse)
    expect(unsupported.initialState.status).toBe('unsupported-market')
    await unsupported.run()
    expect(reverse).toHaveBeenCalledTimes(3)
  })
})