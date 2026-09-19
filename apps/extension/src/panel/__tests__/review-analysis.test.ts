import { describe, expect, it } from 'vitest'
import type { SellerSpriteReviewCommentsData } from '@cookie-amazon/protocol'
import { analyzeSellerSpriteReviews } from '../review-analysis'

const data = (count: number): SellerSpriteReviewCommentsData => ({
  page: 1,
  size: count,
  total: 100,
  took: 1,
  items: Array.from({ length: count }, (_, index) => ({
    id: 'review-' + index,
    asin: 'B08H26Z7D9',
    parent: null,
    date: 1_700_000_000_000 + index,
    title: index < 2 ? 'Broken quickly' : 'A review title',
    titleCn: null,
    content: index < 2 ? 'Poor quality, broke after a week' : 'A neutral customer comment',
    contentCn: null,
    star: index < 2 ? 2 : 4,
    skus: [],
    likes: 0,
    images: [],
    verified: true,
    vine: false,
  })),
})

describe('analyzeSellerSpriteReviews', () => {
  it('keeps sample coverage and returns stable low-star pain points', () => {
    const result = analyzeSellerSpriteReviews(data(6))
    expect(result).toMatchObject({ sampled: 6, total: 100, coverage: 0.06, lowStarCount: 2, sampleSufficient: true })
    expect(result.painPoints[0]).toMatchObject({ label: '质量与耐久', count: 2, lowStarCount: 2, lowStarShare: 1 })
    expect(result.painPoints[0]?.excerpts).toHaveLength(1)
  })

  it('does not generate a pain point conclusion from an insufficient sample', () => {
    const result = analyzeSellerSpriteReviews(data(5))
    expect(result.sampleSufficient).toBe(false)
    expect(result.painPoints).toEqual([])
  })
})
