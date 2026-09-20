/**
 * 单个 ASIN 分析的窄协议。
 *
 * 扩展只发送已经裁剪过的结构化证据；Worker 只返回文字、证据引用和
 * 固定视图类型。协议里没有 HTML、Cookie、模型生成代码或任意图表配置。
 */

export const ANALYSIS_SCHEMA_VERSION = 1 as const
export const ANALYSIS_ASK_PATH = '/api/analysis/ask' as const

export type AnalysisSource = 'storefront' | 'sellersprite' | 'derived' | 'research-record'

export type AnalysisTrendPoint = {
  month: string
  searches: number
  index: number
}

export type AnalysisTrend =
  | { kind: 'line'; pointCount: number; sampleCount: number; segments: AnalysisTrendPoint[][] }
  | { kind: 'insufficient'; sampleCount: number }
  | { kind: 'unavailable' }

export type AnalysisKeywordRow = {
  keyword: string
  natural: string
  ad: string
  naturalShare: string
  adShare: string
  types: string
  trend: AnalysisTrend
}

export type AnalysisKeywordSummary = {
  totalKeywords: number
  rankedKeywords: number
  adKeywords: number
  sourceTypeCounts: Array<{ code: string; label: string; count: number }>
}

export type AnalysisReviewPainPoint = {
  label: string
  count: number
  lowStarCount: number
  lowStarShare: number
  asinCount: number
  averageStar: number
  excerpts: string[]
}

export type AnalysisReviewEvidence = {
  sampled: number
  total: number
  coverage: number
  lowStarCount: number
  sampleSufficient: boolean
  painPoints: AnalysisReviewPainPoint[]
}

export type AnalysisResearchRecord = {
  owner: string
  status: 'researching' | 'verified' | 'rejected'
  summary: string
  updatedAt: number
}

export type AnalysisEvidence = {
  asin: string
  market: string
  object: {
    source: 'manual' | 'storefront'
    title: string | null
    price: number | null
    rating: number | null
    reviews: number | null
    sponsored: boolean | null
  }
  keyword: { summary: AnalysisKeywordSummary; rows: AnalysisKeywordRow[] } | null
  reviews: AnalysisReviewEvidence | null
  record: AnalysisResearchRecord | null
}

export type AnalysisFact = {
  id: string
  label: string
  value: string
  source: AnalysisSource
}

export type AnalysisCitation = AnalysisFact

export type AnalysisViewType =
  | 'object-summary'
  | 'keyword-summary'
  | 'keyword-table'
  | 'keyword-trend'
  | 'review-summary'
  | 'review-pain-points'
  | 'research-record'

export type AnalysisViewSpec = {
  schemaVersion: typeof ANALYSIS_SCHEMA_VERSION
  views: AnalysisViewType[]
}

export type AnalysisAnswer = {
  facts: string[]
  inferences: string[]
  citations: AnalysisCitation[]
}

export type AnalysisAskRequest = {
  schemaVersion: typeof ANALYSIS_SCHEMA_VERSION
  asin: string
  market: string
  question: string
  evidence: AnalysisEvidence
}

export type AnalysisAskSuccess = {
  ok: true
  answer: AnalysisAnswer
  view: AnalysisViewSpec
}

export type AnalysisAskFailure = {
  ok: false
  error: 'BAD_REQUEST' | 'UNSUPPORTED_SCOPE' | 'AI_UNAVAILABLE' | 'AI_RESPONSE_INVALID'
  message: string
}

export type AnalysisAskResponse = AnalysisAskSuccess | AnalysisAskFailure

type RecordValue = Record<string, unknown>

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isText = (value: unknown, max: number, allowEmpty = true): value is string =>
  typeof value === 'string' && value.length <= max && (allowEmpty || value.trim().length > 0)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isNullableFiniteNumber = (value: unknown): value is number | null =>
  value === null || isFiniteNumber(value)

const isTrend = (value: unknown): value is AnalysisTrend => {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'unavailable') return Object.keys(value).length === 1
  if (value.kind === 'insufficient') {
    return Object.keys(value).length === 2
      && Number.isInteger(value.sampleCount) && (value.sampleCount as number) >= 0 && (value.sampleCount as number) <= 100
  }
  if (value.kind !== 'line' || Object.keys(value).length !== 4) return false
  if (!Number.isInteger(value.pointCount) || (value.pointCount as number) < 1 || (value.pointCount as number) > 100) return false
  if (!Number.isInteger(value.sampleCount) || (value.sampleCount as number) < 1 || (value.sampleCount as number) > 100) return false
  if (!Array.isArray(value.segments) || value.segments.length > 20) return false
  return value.segments.every((segment) => Array.isArray(segment) && segment.length > 0 && segment.length <= 100 && segment.every((point) =>
    isRecord(point)
    && Object.keys(point).length === 3
    && isText(point.month, 32, false)
    && isFiniteNumber(point.searches)
    && point.searches >= 0
    && Number.isInteger(point.index)
    && (point.index as number) >= 0
    && (point.index as number) <= 100,
  ))
}

const isKeywordRow = (value: unknown): value is AnalysisKeywordRow =>
  isRecord(value)
  && Object.keys(value).length === 7
  && isText(value.keyword, 256, false)
  && isText(value.natural, 64)
  && isText(value.ad, 64)
  && isText(value.naturalShare, 64)
  && isText(value.adShare, 64)
  && isText(value.types, 256)
  && isTrend(value.trend)

const isKeywordSummary = (value: unknown): value is AnalysisKeywordSummary => {
  if (!isRecord(value) || Object.keys(value).length !== 4) return false
  if (![value.totalKeywords, value.rankedKeywords, value.adKeywords].every((item) => Number.isInteger(item) && (item as number) >= 0 && (item as number) <= 1000)) return false
  if (!Array.isArray(value.sourceTypeCounts) || value.sourceTypeCounts.length > 20) return false
  return value.sourceTypeCounts.every((item) => isRecord(item)
    && Object.keys(item).length === 3
    && isText(item.code, 64, false)
    && isText(item.label, 128, false)
    && Number.isInteger(item.count)
    && (item.count as number) >= 0
    && (item.count as number) <= 1000)
}

const isReviewPainPoint = (value: unknown): value is AnalysisReviewPainPoint =>
  isRecord(value)
  && Object.keys(value).length === 7
  && isText(value.label, 128, false)
  && Number.isInteger(value.count) && (value.count as number) >= 0 && (value.count as number) <= 1000
  && Number.isInteger(value.lowStarCount) && (value.lowStarCount as number) >= 0 && (value.lowStarCount as number) <= 1000
  && isFiniteNumber(value.lowStarShare) && value.lowStarShare >= 0 && value.lowStarShare <= 1
  && Number.isInteger(value.asinCount) && (value.asinCount as number) >= 0 && (value.asinCount as number) <= 1000
  && isFiniteNumber(value.averageStar) && value.averageStar >= 0 && value.averageStar <= 5
  && Array.isArray(value.excerpts) && value.excerpts.length <= 5 && value.excerpts.every((item) => isText(item, 500, false))

const isReviewEvidence = (value: unknown): value is AnalysisReviewEvidence =>
  isRecord(value)
  && Object.keys(value).length === 6
  && [value.sampled, value.lowStarCount].every((item) => Number.isInteger(item) && (item as number) >= 0 && (item as number) <= 1000)
  && Number.isSafeInteger(value.total) && (value.total as number) >= 0
  && isFiniteNumber(value.coverage) && value.coverage >= 0 && value.coverage <= 1
  && typeof value.sampleSufficient === 'boolean'
  && Array.isArray(value.painPoints) && value.painPoints.length <= 20 && value.painPoints.every(isReviewPainPoint)

const isEvidence = (value: unknown): value is AnalysisEvidence => {
  if (!isRecord(value) || Object.keys(value).length !== 6) return false
  if (!/^[A-Z0-9]{10}$/.test(String(value.asin))) return false
  if (!isText(value.market, 16, false)) return false
  if (!isRecord(value.object) || Object.keys(value.object).length !== 6) return false
  if (value.object.source !== 'manual' && value.object.source !== 'storefront') return false
  if (!isText(value.object.title, 500) && value.object.title !== null) return false
  if (!isNullableFiniteNumber(value.object.price) || !isNullableFiniteNumber(value.object.rating)
    || !isNullableFiniteNumber(value.object.reviews) || (value.object.sponsored !== null && typeof value.object.sponsored !== 'boolean')) return false
  if (value.keyword !== null) {
    if (!isRecord(value.keyword) || Object.keys(value.keyword).length !== 2 || !isKeywordSummary(value.keyword.summary)
      || !Array.isArray(value.keyword.rows) || value.keyword.rows.length > 50 || !value.keyword.rows.every(isKeywordRow)) return false
  }
  if (value.reviews !== null && !isReviewEvidence(value.reviews)) return false
  if (value.record !== null) {
    if (!isRecord(value.record) || Object.keys(value.record).length !== 4
      || !isText(value.record.owner, 128, false)
      || !['researching', 'verified', 'rejected'].includes(String(value.record.status))
      || !isText(value.record.summary, 500)
      || !isFiniteNumber(value.record.updatedAt)) return false
  }
  return true
}

export const isAnalysisAskRequest = (value: unknown): value is AnalysisAskRequest =>
  isRecord(value)
  && Object.keys(value).length === 5
  && value.schemaVersion === ANALYSIS_SCHEMA_VERSION
  && /^[A-Z0-9]{10}$/.test(String(value.asin))
  && isText(value.market, 16, false)
  && isText(value.question, 1_000, false)
  && isEvidence(value.evidence)
  && value.evidence.asin === value.asin
  && value.evidence.market.toUpperCase() === String(value.market).toUpperCase()

/**
 * 固定视图类型清单，是「分区与视图类型一一对应」里那份唯一的类型表。
 * 顺序也是展示顺序：抽屉分区与回答里的内嵌视图都按它排。
 */
export const ANALYSIS_VIEW_TYPES: readonly AnalysisViewType[] = [
  'object-summary', 'keyword-summary', 'keyword-table', 'keyword-trend',
  'review-summary', 'review-pain-points', 'research-record',
]
const VIEW_TYPES = ANALYSIS_VIEW_TYPES
const VIEW_ORDER = new Map(VIEW_TYPES.map((type, index) => [type, index]))

const hasKeywordTrend = (evidence: AnalysisEvidence): boolean =>
  evidence.keyword?.rows.some((row) => row.trend.kind === 'line') === true

const isViewAvailable = (type: AnalysisViewType, evidence: AnalysisEvidence): boolean => {
  if (type === 'object-summary') return true
  if (type === 'keyword-summary' || type === 'keyword-table') return evidence.keyword !== null && evidence.keyword.rows.length > 0
  if (type === 'keyword-trend') return hasKeywordTrend(evidence)
  if (type === 'review-summary') return evidence.reviews !== null
  if (type === 'review-pain-points') return (evidence.reviews?.painPoints.length ?? 0) > 0
  return evidence.record !== null
}

const fallbackViews = (evidence: AnalysisEvidence): AnalysisViewType[] => [
  'object-summary',
  ...(evidence.keyword ? ['keyword-summary', ...(hasKeywordTrend(evidence) ? ['keyword-trend'] : []), ...(evidence.keyword.rows.length > 0 ? ['keyword-table'] : [])] : []),
  ...(evidence.reviews ? ['review-summary', ...(evidence.reviews.painPoints.length > 0 ? ['review-pain-points'] : [])] : []),
  ...(evidence.record ? ['research-record'] : []),
] as AnalysisViewType[]

/**
 * 只保留固定组件，丢弃未知类型并按固定顺序排序。
 * 当模型给出的视图和数据不匹配时，关键词区降级为固定表格。
 */
export const normalizeAnalysisViewSpec = (value: unknown, evidence: AnalysisEvidence): AnalysisViewSpec => {
  const requested = isRecord(value) && Array.isArray(value.views) ? value.views : []
  const types = requested.filter((item): item is AnalysisViewType => typeof item === 'string' && VIEW_TYPES.includes(item as AnalysisViewType))
  const resolved = new Set<AnalysisViewType>()
  for (const type of types) {
    if (isViewAvailable(type, evidence)) resolved.add(type)
    else if ((type === 'keyword-trend' || type === 'keyword-summary') && isViewAvailable('keyword-table', evidence)) resolved.add('keyword-table')
  }
  const views = [...resolved].sort((left, right) => VIEW_ORDER.get(left)! - VIEW_ORDER.get(right)!)
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    views: views.length > 0 ? views : fallbackViews(evidence),
  }
}

const isCitation = (value: unknown): value is AnalysisCitation =>
  isRecord(value)
  && Object.keys(value).length === 4
  && isText(value.id, 128, false)
  && isText(value.label, 256, false)
  && isText(value.value, 1_000, false)
  && ['storefront', 'sellersprite', 'derived', 'research-record'].includes(String(value.source))

const isAnswer = (value: unknown): value is AnalysisAnswer =>
  isRecord(value)
  && Object.keys(value).length === 3
  && Array.isArray(value.facts) && value.facts.length <= 8 && value.facts.every((item) => isText(item, 1_000, false))
  && Array.isArray(value.inferences) && value.inferences.length <= 8 && value.inferences.every((item) => isText(item, 1_000, false))
  && Array.isArray(value.citations) && value.citations.length <= 16 && value.citations.every(isCitation)

export const isAnalysisAskResponse = (value: unknown): value is AnalysisAskResponse => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  if (!value.ok) return ['BAD_REQUEST', 'UNSUPPORTED_SCOPE', 'AI_UNAVAILABLE', 'AI_RESPONSE_INVALID'].includes(String(value.error))
    && isText(value.message, 500, false)
  return isAnswer(value.answer)
    && isRecord(value.view)
    && value.view.schemaVersion === ANALYSIS_SCHEMA_VERSION
    && Array.isArray(value.view.views)
    && value.view.views.length <= VIEW_TYPES.length
    && value.view.views.every((item) => typeof item === 'string' && VIEW_TYPES.includes(item as AnalysisViewType))
}
