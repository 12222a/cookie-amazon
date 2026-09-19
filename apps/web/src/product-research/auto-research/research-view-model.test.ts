import { describe, expect, it } from 'vitest'
import { DEFAULT_RESEARCH_POLICY, type ResearchJob } from '@cookie-amazon/research-core'
import {
  EVIDENCE_TABS,
  STAGE_LABELS,
  STATUS_LABELS,
  buildCandidateCsv,
  buildCandidateEvidenceSummary,
  buildFinalDecisionSnapshot,
  buildFinalDecisionList,
  currentReviewEvidence,
  filterResearchCandidates,
  formatResearchNumber,
  formatResearchRatio,
  painPointEvidenceStrength,
  explainExecutionMessage,
  primaryResearchError,
  researchErrorExplanation,
  stageImpact,
  sumBudget,
} from './research-view-model'

describe('automatic research view model', () => {
  it('keeps all seven pipeline stages and six report tabs visible', () => {
    expect(Object.keys(STAGE_LABELS)).toEqual([
      'discovery',
      'reverseKeywords',
      'keywordMining',
      'abaValidation',
      'marketStructure',
      'reviewAnalysis',
      'decision',
    ])
    expect(EVIDENCE_TABS.map((tab) => tab.id)).toEqual([
      'overview',
      'candidates',
      'keywords',
      'market',
      'reviews',
      'execution',
    ])
  })

  it('formats missing metrics explicitly instead of inventing values', () => {
    expect(formatResearchNumber(null)).toBe('—')
    expect(formatResearchRatio(undefined)).toBe('—')
    expect(formatResearchNumber(12_345.67)).toBe('12,345.7')
    expect(formatResearchRatio(0.126)).toBe('13%')
  })

  it('filters candidates and exports stable UTF-8 CSV rows with escaped values', () => {
    const candidates = [
      { asin: 'B000000001', title: 'Stand, "Pro"', brand: 'Acme', discoveryScore: 88, estimatedSales: 320, price: 25, rating: 4.3, reviews: 90, sellers: 1, imageUrl: null, salesGrowth: null, tier: 'A', researchDepth: 'deep' },
      { asin: 'B000000002', title: 'Basic Stand', brand: null, discoveryScore: 70, estimatedSales: 120, price: null, rating: null, reviews: null, sellers: null, imageUrl: null, salesGrowth: null, tier: 'C', researchDepth: 'comparison' },
    ] satisfies ResearchJob['evidence']['candidates']

    expect(filterResearchCandidates(candidates, 'deep').map((item) => item.asin)).toEqual(['B000000001'])
    expect(filterResearchCandidates(candidates, 'high-score').map((item) => item.asin)).toEqual(['B000000001'])
    expect(filterResearchCandidates(candidates, 'all')).toHaveLength(2)

    const csv = buildCandidateCsv(candidates)
    expect(csv.startsWith('\uFEFF排名,层级,ASIN,商品标题')).toBe(true)
    expect(csv).toContain('"Stand, ""Pro"""')
    expect(csv).toContain('Top 3 深度研究')
    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('builds candidate-specific evidence tags without assigning deep evidence to comparison rows', () => {
    const candidates = [
      { asin: 'B000000001', title: 'Deep Stand', brand: null, discoveryScore: 88, estimatedSales: 320, price: 25, rating: 4.3, reviews: 90, sellers: 1, imageUrl: null, salesGrowth: null, tier: 'A', researchDepth: 'deep' },
      { asin: 'B000000002', title: 'Comparison Stand', brand: null, discoveryScore: 70, estimatedSales: 120, price: 20, rating: 4, reviews: 30, sellers: 1, imageUrl: null, salesGrowth: null, tier: 'C', researchDepth: 'comparison' },
    ] satisfies ResearchJob['evidence']['candidates']
    const job = {
      evidence: {
        candidates,
        reverseKeywords: [{ sourceAsins: ['B000000001'] }],
        minedKeywords: [{ keyword: 'stand' }],
        aba: [], competitors: [{ keyword: 'stand' }], markets: [],
        reviewItems: [
          { asin: 'B000000001', star: 1, title: 'Broken', content: 'Poor quality broke quickly', variation: [], likes: 0 },
          { asin: 'B000000001', star: 2, title: 'Cracked', content: 'Cheap plastic cracked', variation: [], likes: 0 },
        ],
      },
    } as unknown as ResearchJob

    const deepSummary = buildCandidateEvidenceSummary(job, candidates[0])
    expect(deepSummary).toMatchObject({ rank: 1, isDeepResearch: true, reverseKeywordCount: 1, reviewSampleCount: 2, lowStarReviewCount: 2 })
    expect(deepSummary.tags.every((tag) => tag.state === 'available')).toBe(true)
    expect(deepSummary.painPoints.map((pain) => pain.id)).toContain('quality')

    const comparisonSummary = buildCandidateEvidenceSummary(job, candidates[1])
    expect(comparisonSummary).toMatchObject({ rank: 2, isDeepResearch: false, reverseKeywordCount: 0, reviewSampleCount: 0 })
    expect(comparisonSummary.tags.filter((tag) => tag.label !== '类目发现').every((tag) => tag.state === 'comparison')).toBe(true)
  })

  it('returns every researched ASIN instead of only the highest-ranked candidate', () => {
    const candidates = [
      { asin: 'B000000001', title: 'First', discoveryScore: 90 },
      { asin: 'B000000002', title: 'Second', discoveryScore: 86 },
      { asin: 'B000000003', title: 'Pending', discoveryScore: 80 },
    ]
    const job = {
      evidence: { candidates },
      candidateDecisions: [
        { asin: 'B000000001', priority: '重点验证', nextStep: '验证一', reasons: [], missing: [], scores: { demand: 80, entry: 70, differentiation: 60, confidence: 80 } },
        { asin: 'B000000002', priority: '重点验证', nextStep: '验证二', reasons: [], missing: [], scores: { demand: 78, entry: 68, differentiation: 58, confidence: 78 } },
        { asin: 'B000000003', priority: '待补充研究', nextStep: '补充证据', reasons: [], missing: [], scores: { demand: 55, entry: 50, differentiation: 45, confidence: 50 } },
      ],
    } as unknown as ResearchJob

    expect(buildFinalDecisionList(job).map((item) => item.asin)).toEqual(['B000000001', 'B000000002', 'B000000003'])
  })


  it('classifies review pain-point evidence strength', () => {
    const pain = {
      id: 'quality', label: '质量与耐久', count: 8, lowStarCount: 6, asinCount: 2,
      lowStarShare: 0.75, averageStar: 2, variations: [], excerpts: [], direction: '改进质量',
    } satisfies ResearchJob['evidence']['reviews']['painPoints'][number]

    expect(painPointEvidenceStrength(pain)).toBe('强')
    expect(painPointEvidenceStrength({ ...pain, lowStarCount: 3, lowStarShare: 0.6 })).toBe('中')
    expect(painPointEvidenceStrength({ ...pain, lowStarCount: 2, asinCount: 1, lowStarShare: 1 })).toBe('初步')
  })

  it('rebuilds displayed review evidence from deduplicated review items', () => {
    const duplicate = {
      asin: 'B000000001', star: 1, title: 'Broken', content: 'Poor quality, broke after a week', variation: [], likes: 0,
    }
    const job = {
      evidence: {
        reviewItems: [duplicate, { ...duplicate, title: 'Duplicate upstream title' }],
        reviews: {
          sampled: 2,
          lowStarCount: 2,
          painPoints: [{
            id: 'quality', label: '质量与耐久', count: 2, lowStarCount: 2, asinCount: 1,
            lowStarShare: 1, averageStar: 1, variations: [], excerpts: [duplicate.content], direction: '改进质量',
          }],
        },
      },
    } as unknown as ResearchJob

    expect(currentReviewEvidence(job)).toMatchObject({
      sampled: 1,
      lowStarCount: 1,
      painPoints: [expect.objectContaining({ id: 'quality', count: 1, lowStarCount: 1 })],
    })
  })

  it('builds a concrete final summary from pain points and available evidence', () => {
    const job = {
      evidence: {
        candidates: [{
          asin: 'B000000001', title: 'Stand', discoveryScore: 88, estimatedSales: 420,
          price: 25, rating: 4.2, reviews: 135,
        }],
        reverseKeywords: [],
        minedKeywords: [],
        aba: [{ keyword: 'portable stand', searches: 12_300, purchaseRate: 0.11, products: 980 }],
        competitors: [{
          keyword: 'portable stand', productCount: 20, medianReviews: 240,
          medianListingAgeDays: 560, top10SalesConcentration: 0.64,
        }],
        markets: [{
          keyword: 'portable stand', brandConcentration: 0.58, sellerConcentration: 0.49,
          newProductShare: 0.16, totalProducts: 1_200,
        }],
        reviews: {
          sampled: 20,
          lowStarCount: 12,
          painPoints: [{
            id: 'quality', label: '质量与耐久', count: 8, lowStarCount: 7, asinCount: 2,
            lowStarShare: 0.875, averageStar: 2.1, variations: [],
            excerpts: ['Broke after one week'], direction: '强化耐久性和出厂质量检查',
          }],
        },
      },
      stages: Object.fromEntries([
        'discovery', 'reverseKeywords', 'keywordMining', 'abaValidation',
        'marketStructure', 'reviewAnalysis', 'decision',
      ].map((id) => [id, { status: 'complete' }])),
    } as unknown as ResearchJob

    const snapshot = buildFinalDecisionSnapshot(job)
    expect(snapshot.painPoints.map((pain) => pain.label)).toEqual(['质量与耐久'])
    expect(snapshot.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'keyword', value: 'portable stand', detail: expect.stringContaining('12,300') }),
      expect.objectContaining({ id: 'price', value: '$25 中位数', detail: expect.stringContaining('有效价格样本 1 / 1') }),
      expect.objectContaining({ id: 'barrier', value: '240 条评论', detail: expect.stringContaining('64%') }),
      expect.objectContaining({ id: 'reviews', value: '12 / 20 条', detail: expect.stringContaining('60%') }),
      expect.objectContaining({ id: 'market', value: '品牌 58%', detail: expect.stringContaining('新品占比 16%') }),
      expect.objectContaining({ id: 'coverage', value: '7 / 7 阶段完整', detail: expect.stringContaining('证据覆盖 5 / 6 类') }),
    ]))
  })

  it('marks unavailable final-summary metrics explicitly instead of fabricating numbers', () => {
    const snapshot = buildFinalDecisionSnapshot({
      evidence: {
        candidates: [], reverseKeywords: [], minedKeywords: [], aba: [], competitors: [], markets: [],
        reviews: { sampled: 0, lowStarCount: 0, painPoints: [] },
      },
    } as unknown as ResearchJob)

    expect(snapshot.painPoints).toEqual([])
    expect(snapshot.metrics.filter((metric) => metric.id !== 'coverage').every((metric) => metric.value === '暂无数据')).toBe(true)
    expect(snapshot.metrics.find((metric) => metric.id === 'coverage')).toMatchObject({
      value: '0 / 6 类证据',
      detail: expect.stringContaining('缺失：候选商品、关键词、ABA 需求、竞品门槛、市场结构、评论样本'),
    })

    const emptyMarketSnapshot = buildFinalDecisionSnapshot({
      evidence: {
        candidates: [], reverseKeywords: [], minedKeywords: [], aba: [], competitors: [],
        markets: [{ keyword: 'empty market', totalProducts: null, totalSales: null, fbaRatio: null, amzRatio: null, fbmRatio: null, brandConcentration: null, sellerConcentration: null, newProductShare: null }],
        reviews: { sampled: 0, lowStarCount: 0, painPoints: [] },
      },
    } as unknown as ResearchJob)
    expect(emptyMarketSnapshot.metrics.find((metric) => metric.id === 'coverage')?.detail).toContain('市场结构')
  })

  it('shows partial, skipped, failed and cancelled execution impacts', () => {
    const job = {
      stages: {
        discovery: { status: 'partial' },
        reverseKeywords: { status: 'skipped' },
        keywordMining: { status: 'failed' },
        abaValidation: { status: 'cancelled' },
      },
    } as unknown as ResearchJob

    expect(stageImpact(job, 'discovery')).toContain('可信度')
    expect(stageImpact(job, 'reverseKeywords')).toContain('证据缺口')
    expect(stageImpact(job, 'keywordMining')).toContain('其他阶段结果')
    expect(stageImpact(job, 'abaValidation')).toContain('不会继续')
    expect(STATUS_LABELS.partial).toBe('部分成功')
  })

  it('translates opaque execution codes and skip reasons into actionable guidance', () => {
    expect(researchErrorExplanation({ kind: 'network', message: 'EXTENSION_UNAVAILABLE', fatal: false, retryable: true })).toEqual({
      reason: '网页与扩展的数据通道中断。',
      action: '重新加载扩展和当前页面，再检查数据通道状态。',
    })
    expect(researchErrorExplanation({ kind: 'contract', message: 'TARGET_RESPONSE_INVALID', fatal: true, retryable: false }).action).toContain('扩展解析器')
    expect(explainExecutionMessage('remote-capabilities-blocked')).toContain('后续远端阶段已停止')
  })

  it('selects the first root-cause stage error for the report headline', () => {
    const noErrors = { errors: [] }
    const reverseError = { kind: 'contract' as const, message: 'TARGET_RESPONSE_INVALID · HTTP 200', fatal: true, retryable: false }
    const job = {
      stages: {
        discovery: noErrors,
        reverseKeywords: { errors: [reverseError] },
        keywordMining: noErrors,
        abaValidation: noErrors,
        marketStructure: noErrors,
        reviewAnalysis: noErrors,
        decision: noErrors,
      },
    } as unknown as ResearchJob

    expect(primaryResearchError(job)).toEqual({ stageId: 'reverseKeywords', error: reverseError })
  })

  it('derives the displayed remote-call budget from the domain policy', () => {
    expect(sumBudget(DEFAULT_RESEARCH_POLICY.budget)).toBe(24)
  })
})