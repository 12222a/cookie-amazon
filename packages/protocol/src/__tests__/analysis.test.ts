import { describe, expect, it } from 'vitest'
import {
  isAnalysisAskRequest,
  normalizeAnalysisViewSpec,
  toAnalysisHistory,
  MAX_HISTORY_TEXT_TOTAL,
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
      schemaVersion: 2 as const,
      asin: 'B0ABCDEFGH',
      market: 'US',
      question: '这个 ASIN 的词位情况怎么样？',
      evidence: evidence(),
      history: { truncated: false, turns: [] },
    }
    expect(isAnalysisAskRequest(request)).toBe(true)
    expect(isAnalysisAskRequest({ ...request, evidence: { ...request.evidence, reviews: { sampled: 10, total: 50000, coverage: 0.0002, lowStarCount: 2, sampleSufficient: true, painPoints: [] } } })).toBe(true)
    expect(isAnalysisAskRequest({ ...request, evidence: { ...request.evidence, asin: 'B0ZZZZZZZZ' } })).toBe(false)
    expect(isAnalysisAskRequest({ ...request, question: 'x'.repeat(1_001) })).toBe(false)
  })

  it('drops the oldest turns until the history fits both caps, and says it dropped them', () => {
    const turn = (question: string, length = 4) => ({ question, facts: ['x'.repeat(length)], inferences: [] })
    // 条数上限：第 4 轮进来时最老的一轮出局。
    expect(toAnalysisHistory([turn('一'), turn('二'), turn('三'), turn('四')])).toEqual({
      truncated: true,
      turns: [turn('二'), turn('三'), turn('四')],
    })
    expect(toAnalysisHistory([turn('一'), turn('二'), turn('三')]).truncated).toBe(false)
    // 总长上限：逐条都合法，合起来擦着上限也会把整条请求顶出字节上限，所以也要让位。
    // 三轮看着都在条数上限内，但总长放不下：最老的那轮让位。
    const heavy = turn('重', MAX_HISTORY_TEXT_TOTAL / 2)
    expect(toAnalysisHistory([turn('一'), heavy, heavy]).turns).toEqual([heavy])
    expect(toAnalysisHistory([turn('一'), heavy, heavy]).truncated).toBe(true)
    // 单独一轮就超总长时不带它：带上就等于发一条注定被字节上限拒掉的请求。
    expect(toAnalysisHistory([turn('一'), turn('重', MAX_HISTORY_TEXT_TOTAL)]).turns).toEqual([])
  })

  it('takes only bounded question and answer text as history, and rejects anything else', () => {
    const request = {
      schemaVersion: 2 as const,
      asin: 'B0ABCDEFGH',
      market: 'US',
      question: '那长尾词呢？',
      evidence: evidence(),
      history: { truncated: false, turns: [] },
    }
    const turn = { question: '它主要靠广告撑着吗？', facts: ['广告位占比 20%。'], inferences: ['自然位是主要入口。'] }
    expect(isAnalysisAskRequest({ ...request, history: { truncated: false, turns: [turn] } })).toBe(true)
    // 契约版本升级：旧版本号与历史字段对不上，不能按新契约解释。
    expect(isAnalysisAskRequest({ ...request, schemaVersion: 1 })).toBe(false)
    // 上限 3 轮：第 4 轮该由发送端从最早处截断，服务端见到就拒绝，不静默丢弃。
    expect(isAnalysisAskRequest({ ...request, history: { truncated: true, turns: [turn, turn, turn, turn] } })).toBe(false)
    // 超长度同样拒绝：让它自己变短，比替它裁掉一句话更安全。
    expect(isAnalysisAskRequest({ ...request, history: { truncated: false, turns: [{ ...turn, question: 'x'.repeat(1_001) }] } })).toBe(false)
    expect(isAnalysisAskRequest({ ...request, history: { truncated: false, turns: [{ ...turn, facts: ['x'.repeat(1_001)] }] } })).toBe(false)
    expect(isAnalysisAskRequest({ ...request, history: { truncated: false, turns: [{ ...turn, facts: [] }] } })).toBe(false)
    // 缺字段、多字段都拒：多出来的那一个就是证据包副本或视图规格混进历史的地方。
    expect(isAnalysisAskRequest({ ...request, history: { truncated: false, turns: [{ question: turn.question }] } })).toBe(false)
    expect(isAnalysisAskRequest({ ...request, history: { truncated: false, turns: [{ ...turn, views: ['keyword-table'] }] } })).toBe(false)
    expect(isAnalysisAskRequest({ ...request, history: { truncated: false, turns: [], evidence } })).toBe(false)
    expect(isAnalysisAskRequest({ ...request, history: { truncated: false } })).toBe(false)
    expect(isAnalysisAskRequest({ ...request, history: { turns: [] } })).toBe(false)
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
