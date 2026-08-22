import type {
  SellerSpriteProductSelectionInput,
  SellerSpriteProductSelectionItem,
  SellerSpriteReviewCommentsData,
  SellerSpriteReviewCommentsInput,
} from '@cookie-amazon/protocol'

export const P0_REVIEW_CANDIDATE_LIMIT = 3

export const buildP0ProductSelectionInput = (
  market: string,
  categoryId: string,
): SellerSpriteProductSelectionInput => ({
  market,
  page: 1,
  size: 60,
  symbolFlag: false,
  monthName: 'bsr_sales_nearly',
  selectType: '2',
  filterSub: false,
  weightUnit: 'g',
  order: { field: 'total_units', desc: true },
  productTags: [],
  nodeIdPaths: [categoryId],
  sellerTypes: [],
  eligibility: [],
  pkgDimensionTypeList: [],
  sellerNationList: [],
  minRanking: '10000',
  maxRanking: '50000',
  maxSales: '300',
  maxPrice: '30',
  maxSellers: '1',
  lowPrice: 'N',
})

export const buildP0ReviewCommentsInput = (
  asin: string,
  market: string,
): SellerSpriteReviewCommentsInput => ({
  asin,
  keyword: '',
  market,
  pageNum: 1,
  pageSize: 20,
  reviewEndTime: null,
  reviewStartTime: null,
  order: { fieldName: 'date', sort: 1 },
  starList: [],
  typeList: [],
  variations: [],
})

const candidateScore = (item: SellerSpriteProductSelectionItem): number => {
  const sales = item.estimatedSales ?? 0
  const reviews = item.reviews ?? Number.POSITIVE_INFINITY
  const growth = item.salesGrowth ?? 0
  const price = item.price ?? 0
  const sellers = item.sellers ?? Number.POSITIVE_INFINITY
  const demand = Math.min(35, Math.max(0, sales / 300 * 35))
  const reviewBarrier = reviews <= 200 ? 25 : reviews <= 500 ? 20 : reviews <= 1_000 ? 12 : 5
  const growthSignal = growth >= 10 ? 15 : growth >= 0 ? 10 : 3
  const priceSignal = price >= 10 && price <= 50 ? 10 : 4
  const sellerSignal = sellers <= 1 ? 10 : sellers <= 3 ? 5 : 0
  return Math.round(demand + reviewBarrier + growthSignal + priceSignal + sellerSignal)
}

export type P0Candidate = SellerSpriteProductSelectionItem & {
  discoveryScore: number
}

export const rankP0Candidates = (
  items: readonly SellerSpriteProductSelectionItem[],
  limit = P0_REVIEW_CANDIDATE_LIMIT,
): P0Candidate[] => [...items]
  .filter((item) => /^[A-Z0-9]{10}$/.test(item.asin))
  .map((item) => ({ ...item, discoveryScore: candidateScore(item) }))
  .sort((left, right) => right.discoveryScore - left.discoveryScore
    || (right.estimatedSales ?? 0) - (left.estimatedSales ?? 0))
  .slice(0, limit)

const cleanText = (value: string): string => value
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim()

export type P0ReviewSummary = {
  sampled: number
  total: number
  lowStarCount: number
  lowStarShare: number | null
  averageStar: number | null
  painPoints: string[]
}

export const summarizeP0Reviews = (data: SellerSpriteReviewCommentsData): P0ReviewSummary => {
  const lowStar = data.items.filter((item) => item.star <= 3)
  const averageStar = data.items.length === 0
    ? null
    : data.items.reduce((sum, item) => sum + item.star, 0) / data.items.length
  const painPoints = lowStar
    .sort((left, right) => left.star - right.star || right.likes - left.likes)
    .map((item) => cleanText(item.contentCn || item.content || item.titleCn || item.title))
    .filter((item) => item.length > 0)
    .filter((item, index, values) => values.indexOf(item) === index)
    .slice(0, 3)
  return {
    sampled: data.items.length,
    total: data.total,
    lowStarCount: lowStar.length,
    lowStarShare: data.items.length === 0 ? null : lowStar.length / data.items.length,
    averageStar,
    painPoints,
  }
}

export type P0Decision = {
  verdict: 'CONTINUE' | 'WATCH' | 'DROP'
  label: '继续验证' | '观察' | '放弃'
  reasons: string[]
  missing: string[]
}

export const decideP0Candidate = (
  candidate: P0Candidate,
  reviews: P0ReviewSummary | null,
): P0Decision => {
  const sales = candidate.estimatedSales ?? 0
  const reasons = [
    `候选初筛分 ${candidate.discoveryScore}/95，月销量 ${sales || '缺失'}，评论数 ${candidate.reviews ?? '缺失'}`,
    `近 30 天销量增长 ${candidate.salesGrowth == null ? '缺失' : `${candidate.salesGrowth.toFixed(1)}%`}，卖家数 ${candidate.sellers ?? '缺失'}`,
  ]
  if (reviews !== null) {
    reasons.push(`评论样本 ${reviews.sampled}/${reviews.total}，低星样本 ${reviews.lowStarCount}，平均 ${reviews.averageStar?.toFixed(2) ?? '缺失'} 星`)
  }
  const missing = ['采购成本、头程/尾程物流、广告费、税费和退货成本尚未接入，不能判断真实利润']
  if (sales < 50 || candidate.discoveryScore < 35) {
    return { verdict: 'DROP', label: '放弃', reasons: [...reasons, '当前需求或进入条件未达到 P0 初筛门槛'], missing }
  }
  if (candidate.discoveryScore >= 65 && (reviews?.lowStarCount ?? 0) > 0) {
    return { verdict: 'CONTINUE', label: '继续验证', reasons: [...reasons, '需求与竞争门槛较好，且评论样本出现可继续研究的明确痛点'], missing }
  }
  return {
    verdict: 'WATCH',
    label: '观察',
    reasons: [...reasons, reviews === null || reviews.sampled === 0 ? '评论证据不足' : '已有评论证据，但综合门槛尚未达到继续验证条件'],
    missing,
  }
}