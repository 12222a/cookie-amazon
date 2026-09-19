import type {
  SellerSpriteCompetitorData,
  SellerSpriteCompetitorItem,
  SellerSpriteKeywordMiningData,
  SellerSpriteMarketResearchData,
} from '@cookie-amazon/protocol'

export const KEYWORD_DEEP_RESEARCH_LIMIT = 3
export type KeywordSourcePageCount = 1 | 3 | 5

export type KeywordOpportunityFilters = {
  minPrice: number | null
  maxPrice: number | null
  minSales: number | null
  maxReviews: number | null
  minRating: number | null
  maxSellers: number | null
}

export type KeywordOpportunityInput = {
  keyword: string
  market: string
  monthName: string
  newReleaseNum: number
  filters: KeywordOpportunityFilters
}

export type KeywordCandidateEvidence = {
  keywordReverse: 'queued' | 'loading' | 'complete' | 'failed' | 'unavailable'
  monthlySnapshot: 'queued' | 'loading' | 'complete' | 'failed' | 'unavailable'
  reviews: 'queued' | 'loading' | 'complete' | 'failed' | 'unavailable'
}

export type KeywordOpportunityCandidate = SellerSpriteCompetitorItem & {
  rank: number
  tier: 'A' | 'B' | 'C'
  opportunityScore: number
  demandScore: number | null
  competitionScore: number | null
  entryScore: number | null
  evidenceConfidence: number
  status: '重点验证' | '待补充研究' | '暂不优先'
  nextStep: string
  missingEvidence: string[]
  matchedFilters: boolean
  evidence: KeywordCandidateEvidence
}

export type KeywordOpportunityReport = {
  candidates: KeywordOpportunityCandidate[]
  totalReturned: number
  sampledCount: number
  uniqueCount: number
  matchedCount: number
  demandSignal: 'available' | 'unavailable'
  marketSignal: 'available' | 'unavailable'
  evidenceCoverage: number
  filterWarnings: string[]
  economicStatus: 'not-connected'
}

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value))

const finite = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isFinite(value)

const percentile = (values: readonly number[], ratio: number): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]
}

const scale = (value: number, low: number, high: number): number =>
  low === high ? 50 : clamp(((value - low) / (high - low)) * 100)

const logScale = (value: number, low: number, high: number): number =>
  scale(Math.log10(value + 1), Math.log10(low + 1), Math.log10(high + 1))

const isValidAsin = (asin: string): boolean => /^[A-Z0-9]{10}$/.test(asin)

const matchesFilters = (item: SellerSpriteCompetitorItem, filters: KeywordOpportunityFilters): boolean =>
  (!finite(filters.minPrice) || (finite(item.price) && item.price >= filters.minPrice))
  && (!finite(filters.maxPrice) || (finite(item.price) && item.price <= filters.maxPrice))
  && (!finite(filters.minSales) || (finite(item.estimatedSales) && item.estimatedSales >= filters.minSales))
  && (!finite(filters.maxReviews) || (finite(item.reviews) && item.reviews <= filters.maxReviews))
  && (!finite(filters.minRating) || (finite(item.rating) && item.rating >= filters.minRating))
  && (!finite(filters.maxSellers) || true)

const missingFor = (item: SellerSpriteCompetitorItem): string[] => [
  ...(item.price === null ? ['价格'] : []),
  ...(item.estimatedSales === null ? ['预估月销量'] : []),
  ...(item.rating === null ? ['评分'] : []),
  ...(item.reviews === null ? ['评论数'] : []),
  '采购成本、物流、广告、税费和退货成本',
]

const scoreCandidate = (
  item: SellerSpriteCompetitorItem,
  allItems: readonly SellerSpriteCompetitorItem[],
): Pick<KeywordOpportunityCandidate, 'opportunityScore' | 'demandScore' | 'competitionScore' | 'entryScore' | 'evidenceConfidence'> => {
  const sales = allItems.flatMap((value) => finite(value.estimatedSales) ? [value.estimatedSales] : [])
  const reviews = allItems.flatMap((value) => finite(value.reviews) ? [value.reviews] : [])
  const saleLow = percentile(sales, .1)
  const saleHigh = percentile(sales, .9)
  const reviewLow = percentile(reviews, .1)
  const reviewHigh = percentile(reviews, .9)
  const demandScore = finite(item.estimatedSales) && saleLow !== null && saleHigh !== null
    ? Math.round(logScale(item.estimatedSales, saleLow, saleHigh) * .35)
    : null
  const reviewBarrier = finite(item.reviews) && reviewLow !== null && reviewHigh !== null
    ? 100 - logScale(item.reviews, reviewLow, reviewHigh)
    : null
  const ratingSignal = finite(item.rating) ? scale(item.rating, 3.5, 4.8) : null
  const competitionScore = reviewBarrier === null && ratingSignal === null
    ? null
    : Math.round(((reviewBarrier ?? 50) * .7 + (ratingSignal ?? 50) * .3) * .25)
  const entryScore = item.availableDays === null
    ? null
    : Math.round(clamp(100 - scale(item.availableDays, 0, 2_000)) * .2)
  const observed = [item.price, item.estimatedSales, item.rating, item.reviews, item.availableDays]
    .filter((value) => finite(value)).length
  const evidenceConfidence = Math.round(observed / 5 * 100)
  const availableScores = [demandScore, competitionScore, entryScore].filter((value): value is number => value !== null)
  const opportunityScore = availableScores.length === 0
    ? 0
    : Math.round(availableScores.reduce((sum, value) => sum + value, 0) + evidenceConfidence * .15)
  return { opportunityScore: clamp(opportunityScore), demandScore, competitionScore, entryScore, evidenceConfidence }
}

export const mergeKeywordCompetitorPages = (
  pages: readonly SellerSpriteCompetitorData[],
): SellerSpriteCompetitorData => {
  const first = pages[0]
  const last = pages.at(-1)
  if (!first || !last) return { page: 1, pages: 0, size: 0, total: 0, hasNextPage: false, items: [] }
  return {
    page: 1,
    pages: first.pages,
    size: first.size,
    total: first.total,
    hasNextPage: last.hasNextPage,
    items: pages.flatMap((page) => page.items),
  }
}

export const buildKeywordOpportunityReport = (
  data: SellerSpriteCompetitorData,
  input: KeywordOpportunityInput,
  keywordData: SellerSpriteKeywordMiningData | null = null,
  marketData: SellerSpriteMarketResearchData | null = null,
): KeywordOpportunityReport => {
  const unique = [...new Map(data.items
    .filter((item) => isValidAsin(item.asin.toUpperCase()))
    .map((item) => [item.asin.toUpperCase(), { ...item, asin: item.asin.toUpperCase() }])).values()]
  const matched = unique.filter((item) => matchesFilters(item, input.filters))
  const ranked = [...matched]
    .map((item) => ({ item, score: scoreCandidate(item, unique) }))
    .sort((a, b) => b.score.opportunityScore - a.score.opportunityScore
      || (b.item.estimatedSales ?? 0) - (a.item.estimatedSales ?? 0))
  const candidates = ranked.map(({ item, score }, index): KeywordOpportunityCandidate => {
    const rank = index + 1
    const status = rank <= KEYWORD_DEEP_RESEARCH_LIMIT && score.evidenceConfidence >= 60
      ? '重点验证'
      : score.opportunityScore >= 45 ? '待补充研究' : '暂不优先'
    return {
      ...item,
      rank,
      tier: rank === 1 ? 'A' : rank <= 3 ? 'B' : 'C',
      ...score,
      status,
      nextStep: status === '重点验证' ? '补充关键词、月度快照和评论证据' : status === '待补充研究' ? '补齐关键字段后再比较' : '当前不优先投入深度研究',
      missingEvidence: missingFor(item),
      matchedFilters: true,
      evidence: { keywordReverse: rank <= KEYWORD_DEEP_RESEARCH_LIMIT ? 'queued' : 'unavailable', monthlySnapshot: rank <= KEYWORD_DEEP_RESEARCH_LIMIT ? 'queued' : 'unavailable', reviews: rank <= KEYWORD_DEEP_RESEARCH_LIMIT ? 'queued' : 'unavailable' },
    }
  })
  const observed = candidates.reduce((sum, candidate) => sum + candidate.evidenceConfidence, 0)
  return {
    candidates,
    totalReturned: data.total,
    sampledCount: data.items.length,
    uniqueCount: unique.length,
    matchedCount: matched.length,
    demandSignal: keywordData === null ? 'unavailable' : 'available',
    marketSignal: marketData === null ? 'unavailable' : 'available',
    evidenceCoverage: candidates.length === 0 ? 0 : Math.round(observed / candidates.length),
    filterWarnings: finite(input.filters.maxSellers) ? ['当前 COMPETITOR_RESEARCH 响应未返回卖家数，卖家数条件未参与硬筛选'] : [],
    economicStatus: 'not-connected',
  }
}

export const keywordOpportunityToCsv = (
  report: KeywordOpportunityReport,
  input: KeywordOpportunityInput,
): string => {
  const headers = ['关键词', '站点', '统计周期', '新品定义(月)', '排名', '等级', 'ASIN', '标题', '品牌', '价格', '预估月销量', '评分', '评论数', '上架天数', '机会分', '证据可信度', '研究状态', '下一步', '缺失证据', '利润状态']
  const escape = (value: unknown): string => {
    const text = value == null ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const rows = report.candidates.map((candidate) => [
    input.keyword, input.market, input.monthName, input.newReleaseNum, candidate.rank, candidate.tier, candidate.asin,
    candidate.title, candidate.brand, candidate.price, candidate.estimatedSales, candidate.rating, candidate.reviews,
    candidate.availableDays, candidate.opportunityScore, candidate.evidenceConfidence, candidate.status,
    candidate.nextStep, candidate.missingEvidence.join('、'), '未接入',
  ])
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')
}