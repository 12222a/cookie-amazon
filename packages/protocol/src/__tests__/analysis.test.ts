import { describe, expect, it } from 'vitest'
import {
  isAnalysisAskRequest,
  normalizeAnalysisViewSpec,
  type AnalysisEvidence,
} from '../analysis'

const evidence = (withKeyword = true): AnalysisEvidence => ({
  asin: 'B0ABCDEFGH',
  market: 'US',
  object: {
    source: 'storefront', title: 'Example product', price: 29.99,
    rating: 4.5, reviews: 120, sponsored: false,
  },
  keyword: withKeyword ? {
    summary: {
      totalKeywords: 1, rankedKeywords: 1, adKeywords: 0,
      sourceTypeCounts: [{ code: 'NT', label: '自然搜索词', count: 1 }],
    },
    rows: [{
      keyword: 'phone stand', natural: '6', ad: '—', naturalShare: '76%', adShare: '—', types: '自然搜索词',
      trend: {
        kind: 'line', pointCount: 6, sampleCount: 6,
        segments: [[
          { month: '2026-01', searches: 100, index: 0 },
          { month: '2026-02', searches: 110, index: 1 },
          { month: '2026-03', searches: 120, index: 2 },
          { month: '2026-04', searches: 130, index: 3 },
          { month: '2026-05', searches: 140, index: 4 },
          { month: '2026-06', searches: 150, index: 5 },
        ]],
      },
    }],
  } : null,
  reviews: null,
  record: null,
})

describe('analysis protocol', () => {
  it('drops review views without evidence and falls back to the available summary for empty pain points', () => {
    const input = evidence(false)
    expect(normalizeAnalysisViewSpec({ views: ['review-pain-points', 'review-summary'] }, input).views)
      .toEqual(['object-summary'])
    input.reviews = { sampled: 2, total: 10, coverage: 0.2, lowStarCount: 1, sampleSufficient: false, painPoints: [] }
    expect(normalizeAnalysisViewSpec({ views: ['review-pain-points'] }, input).views)
      .toEqual(['object-summary', 'review-summary'])
    input.reviews.painPoints = [{ label: 'quality', count: 1, lowStarCount: 1, lowStarShare: 1, asinCount: 1, averageStar: 1, excerpts: ['broken'] }]
    input.reviews.sampleSufficient = true
    expect(normalizeAnalysisViewSpec({ views: ['review-pain-points'] }, input).views)
      .toEqual(['review-pain-points'])
  })

  it('accepts a bounded evidence request and rejects mismatched ASIN evidence', () => {
    const request = {
      schemaVersion: 1 as const,
      asin: 'B0ABCDEFGH',
      market: 'US',
      question: '这个 ASIN 的词位情况怎么样？',
      evidence: evidence(),
    }
    expect(isAnalysisAskRequest(request)).toBe(true)
    expect(isAnalysisAskRequest({ ...request, evidence: { ...request.evidence, reviews: { sampled: 10, total: 50000, coverage: 0.0002, lowStarCount: 2, sampleSufficient: true, painPoints: [] } } })).toBe(true)
    expect(isAnalysisAskRequest({ ...request, evidence: { ...request.evidence, asin: 'B0ZZZZZZZZ' } })).toBe(false)
    expect(isAnalysisAskRequest({ ...request, question: 'x'.repeat(1_001) })).toBe(false)
  })

  it('discards unknown views, orders stable views, and falls back to a table when trend data is unavailable', () => {
    const full = evidence()
    expect(normalizeAnalysisViewSpec({ views: ['keyword-trend', 'made-up', 'object-summary'] }, full).views)
      .toEqual(['object-summary', 'keyword-trend'])

    const withoutTrend = {
      ...full,
      keyword: { ...full.keyword!, rows: [{ ...full.keyword!.rows[0]!, trend: { kind: 'unavailable' as const } }] },
    }
    expect(normalizeAnalysisViewSpec({ views: ['keyword-trend'] }, withoutTrend).views)
      .toEqual(['keyword-table'])
  })

  it('uses only views whose evidence exists and keeps an object summary available', () => {
    const noKeyword = evidence(false)
    expect(normalizeAnalysisViewSpec({ views: ['keyword-summary', 'keyword-table'] }, noKeyword).views)
      .toEqual(['object-summary'])
  })
})
