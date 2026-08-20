import { describe, expect, it, vi } from 'vitest'
import type { SellerSpriteCompetitorData, SellerSpriteMonthlyData } from '@cookie-amazon/protocol'
import { mergeMonthlyEvidence, prepareMonthlyLookup } from './monthly-lookup'

const competitorData = (asins: string[]): SellerSpriteCompetitorData => ({
  page: 1, pages: 1, size: asins.length, total: asins.length, hasNextPage: false,
  items: asins.map((asin, index) => ({
    asin, title: null, brand: null, imageUrl: null, price: 10, rating: 4,
    reviews: 20, estimatedSales: 100 - index, availableDate: null, availableDays: null,
  })),
})

const monthlyData = (asin: string): SellerSpriteMonthlyData => ({
  historyStatus: 'not-verified',
  variations: [{
    asin, availableDate: 1_700_000_000_000, availableDays: 120,
    bsrLabel: 'Electronics', bsrRank: 1234, currency: '$', price: 29.99,
    rating: 4.5, reviews: 321, reviewsRate: 0.03, station: 'US', title: 'Example',
  }],
})

describe('monthly ASIN lookup orchestration', () => {
  it('limits requests to three ASINs, runs serially, and isolates failures', async () => {
    let active = 0
    const readMonthly = vi.fn(async ({ asin }: { asin: string }) => {
      expect(active).toBe(0)
      active += 1
      await Promise.resolve()
      active -= 1
      if (asin === 'B000000002') throw new Error('quota')
      return monthlyData(asin)
    })
    const job = prepareMonthlyLookup(competitorData([
      'B000000001', 'B000000002', 'B000000003', 'B000000004',
    ]), 'US', readMonthly)

    expect(job.initialState).toMatchObject({ status: 'loading', attemptedAsinCount: 3 })
    const result = await job.run()
    expect(result.state).toMatchObject({
      status: 'partial',
      successfulAsinCount: 2,
      fieldCoverage: {
        price: 2 / 3,
        rating: 2 / 3,
        reviews: 2 / 3,
        listingAge: 2 / 3,
        bsr: 2 / 3,
      },
    })
    expect(readMonthly).toHaveBeenCalledTimes(3)
    expect(result.evidence.map((item) => item.asin)).toEqual(['B000000001', 'B000000003'])
  })

  it('calculates each snapshot field coverage independently', async () => {
    const readMonthly = vi.fn(async ({ asin }: { asin: string }): Promise<SellerSpriteMonthlyData> => {
      const data = monthlyData(asin)
      if (asin === 'B000000002') {
        data.variations[0] = {
          ...data.variations[0],
          price: null,
          reviews: null,
          availableDate: null,
          availableDays: null,
        }
      }
      return data
    })
    const result = await prepareMonthlyLookup(competitorData([
      'B000000001', 'B000000002',
    ]), 'US', readMonthly).run()

    expect(result.state.fieldCoverage).toEqual({
      price: 0.5,
      rating: 1,
      reviews: 0.5,
      listingAge: 0.5,
      bsr: 1,
    })
  })

  it('merges only verified snapshot fields and blocks unsupported markets', async () => {
    const readMonthly = vi.fn(async ({ asin }: { asin: string }) => monthlyData(asin))
    const unsupported = prepareMonthlyLookup(competitorData(['B000000001']), 'JP', readMonthly)
    expect(unsupported.initialState.status).toBe('unsupported-market')
    await unsupported.run()
    expect(readMonthly).not.toHaveBeenCalled()

    const products = competitorData(['B000000001', 'B000000002']).items
    const merged = mergeMonthlyEvidence(products, [{
      asin: 'B000000001', variation: monthlyData('B000000001').variations[0],
    }])
    expect(merged[0]).toMatchObject({
      asin: 'B000000001', price: 29.99, rating: 4.5, reviews: 321,
      availableDays: 120, bsrRank: 1234, monthlyDataStatus: 'available',
    })
    expect(merged[1]).toMatchObject({ asin: 'B000000002', monthlyDataStatus: 'not-requested' })
  })
})