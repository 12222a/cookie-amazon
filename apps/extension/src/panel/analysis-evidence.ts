import type {
  AnalysisEvidence,
  AnalysisKeywordRow,
  AnalysisReviewEvidence,
  AnalysisTrend,
} from '@cookie-amazon/protocol'
import type { AnalysisObject } from '../analysis-object'
import type { ResearchRecord } from '../research-record'
import type { KeywordPositionRow, KeywordPositionSummary } from './keyword-positions'
import type { ReviewPanelData } from './review-analysis'

type EvidenceInput = {
  object: AnalysisObject
  keywordRows?: readonly KeywordPositionRow[]
  keywordSummary?: KeywordPositionSummary | null
  reviewData?: ReviewPanelData | null
  record?: ResearchRecord | null
}

const finiteOrNull = (value: number | null): number | null => value !== null && Number.isFinite(value) ? value : null

const copyTrend = (trend: KeywordPositionRow['trend']): AnalysisTrend => {
  if (trend.kind === 'unavailable') return { kind: 'unavailable' }
  if (trend.kind === 'insufficient') return { kind: 'insufficient', sampleCount: trend.sampleCount }
  return {
    kind: 'line',
    pointCount: trend.pointCount,
    sampleCount: trend.sampleCount,
    segments: trend.segments.map((segment) => segment.map((point) => ({
      month: point.month,
      searches: point.searches,
      index: point.index,
    }))),
  }
}

const copyKeywordRow = (row: KeywordPositionRow): AnalysisKeywordRow => ({
  keyword: row.keyword,
  natural: row.natural,
  ad: row.ad,
  naturalShare: row.naturalShare,
  adShare: row.adShare,
  types: row.types,
  trend: copyTrend(row.trend),
})

const copyReviews = (data: ReviewPanelData | null | undefined): AnalysisReviewEvidence | null => data === null || data === undefined ? null : {
  sampled: data.sampled,
  total: data.total,
  coverage: data.coverage,
  lowStarCount: data.lowStarCount,
  sampleSufficient: data.sampleSufficient,
  painPoints: data.painPoints.map((pain) => ({
    label: pain.label,
    count: pain.count,
    lowStarCount: pain.lowStarCount,
    lowStarShare: pain.lowStarShare,
    asinCount: pain.asinCount,
    averageStar: pain.averageStar,
    excerpts: pain.excerpts.slice(0, 3),
  })),
}

export const buildAnalysisEvidence = (input: EvidenceInput): AnalysisEvidence => ({
  asin: input.object.asin,
  market: input.object.market,
  object: {
    source: input.object.source,
    title: input.object.storefront?.title ?? null,
    price: finiteOrNull(input.object.storefront?.price ?? null),
    rating: finiteOrNull(input.object.storefront?.rating ?? null),
    reviews: finiteOrNull(input.object.storefront?.reviews ?? null),
    sponsored: input.object.storefront?.sponsored ?? null,
  },
  keyword: input.keywordSummary && input.keywordRows ? {
    summary: {
      totalKeywords: input.keywordSummary.totalKeywords,
      rankedKeywords: input.keywordSummary.rankedKeywords,
      adKeywords: input.keywordSummary.adKeywords,
      sourceTypeCounts: input.keywordSummary.sourceTypeCounts.map((item) => ({ ...item })),
    },
    rows: input.keywordRows.slice(0, 50).map(copyKeywordRow),
  } : null,
  reviews: copyReviews(input.reviewData),
  record: input.record ? {
    owner: input.record.owner,
    status: input.record.status,
    summary: input.record.summary,
    updatedAt: input.record.updatedAt,
  } : null,
})
