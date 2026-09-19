export const RESEARCH_STAGE_IDS = [
  'discovery',
  'reverseKeywords',
  'keywordMining',
  'abaValidation',
  'marketStructure',
  'reviewAnalysis',
  'decision',
] as const

export type ResearchStageId = typeof RESEARCH_STAGE_IDS[number]
export type ResearchStageStatus = 'idle' | 'running' | 'complete' | 'partial' | 'skipped' | 'failed' | 'cancelled'
export type CandidateTier = 'A' | 'B' | 'C'
export type CandidateResearchDepth = 'deep' | 'comparison'
export type CandidateResearchPriority = '重点验证' | '待补充研究' | '暂不优先'

export type CandidateResearchDecision = {
  asin: string
  priority: CandidateResearchPriority
  nextStep: string
  reasons: string[]
  missing: string[]
  scores: {
    demand: number | null
    entry: number | null
    differentiation: number | null
    confidence: number
  }
}

export type ResearchVerdict = 'CONTINUE' | 'WATCH' | 'DROP'

export type ResearchStageError = {
  kind: ResearchFailureKind
  message: string
  fatal: boolean
  retryable: boolean
}

export type ResearchStageEvent = {
  at: number
  type: 'stage' | 'request' | 'response' | 'error' | 'skip'
  operation: string
  target: string | null
  message: string
}

export type ResearchStageState = {
  id: ResearchStageId
  status: ResearchStageStatus
  completed: number
  total: number
  calls: number
  startedAt: number | null
  completedAt: number | null
  input: unknown
  output: unknown
  errors: ResearchStageError[]
  events: ResearchStageEvent[]
}

export type ResearchBudgetKey = 'discovery' | 'reverseKeywords' | 'keywordMining' | 'aba' | 'competitors' | 'market' | 'reviews'
export type ResearchBudget = Record<ResearchBudgetKey, number>
export type DiscoveryPageCount = 1 | 3 | 5
export type ProductDiscoveryProfile = 'strict' | 'expanded'

export type ResearchInput = {
  market: string
  categoryId: string
  categoryLabel?: string
  discoveryPages?: DiscoveryPageCount
  discoveryProfile?: ProductDiscoveryProfile
}

export type ProductCandidate = {
  asin: string
  parentAsin?: string | null
  title: string
  brand: string | null
  imageUrl: string | null
  estimatedSales: number | null
  salesGrowth: number | null
  price: number | null
  rating: number | null
  reviews: number | null
  sellers: number | null
  listingAgeDays?: number | null
  discoveryScore: number
  tier?: CandidateTier
  researchDepth?: CandidateResearchDepth
}

export type KeywordMetric = {
  keyword: string
  searchVolume: number | null
  purchaseRate: number | null
  supplyDemandRatio: number | null
  relevancy: number | null
  rank: number | null
  products: number | null
  sourceAsins?: string[]
  sourceTiers?: CandidateTier[]
  departments?: string[]
  isBrandTerm?: boolean
}

export type AggregatedKeyword = KeywordMetric & {
  normalized: string
  sourceAsins: string[]
  sourceTiers: CandidateTier[]
  sourceCount: number
  score: number
  kind: 'core' | 'intent' | 'attribute' | 'brand' | 'other'
}

export type AbaPeriod = {
  table: string
  label: string
  type: 'W' | 'M'
}

export type AbaKeywordEvidence = {
  keyword: string
  period: AbaPeriod
  searchRank: number | null
  searches: number | null
  purchases: number | null
  purchaseRate: number | null
  products: number | null
  rankGrowthRate: number | null
  clickShareRate: number | null
  conversionShareRate: number | null
  sourceAsins?: string[]
}

export type CompetitorEvidence = {
  keyword: string
  productCount: number
  estimatedSales: number | null
  top10SalesConcentration: number | null
  medianReviews: number | null
  medianListingAgeDays: number | null
  newListingShare: number | null
  sourceAsins?: string[]
}

export type MarketEvidence = {
  keyword: string
  totalProducts: number | null
  totalSales: number | null
  fbaRatio: number | null
  amzRatio: number | null
  fbmRatio: number | null
  brandConcentration: number | null
  sellerConcentration: number | null
  newProductShare: number | null
  sourceAsins?: string[]
}

export type ReviewItem = {
  id?: string
  asin: string
  star: number
  title: string
  content: string
  variation: string[]
  likes: number
}

export type ReviewPainPoint = {
  id: string
  label: string
  count: number
  lowStarCount: number
  asinCount: number
  lowStarShare: number
  averageStar: number
  variations: string[]
  excerpts: string[]
  direction: string
}

export type ReviewEvidence = {
  sampled: number
  lowStarCount: number
  painPoints: ReviewPainPoint[]
}

export type ResearchDecision = {
  verdict: ResearchVerdict
  label: '继续验证' | '观察' | '放弃'
  scores: {
    demand: number | null
    entry: number | null
    differentiation: number | null
    confidence: number
  }
  reasons: string[]
  risks: string[]
  missing: string[]
  boundary: string
}

export type ResearchEvidence = {
  candidates: ProductCandidate[]
  reverseKeywords: AggregatedKeyword[]
  seedKeywords: AggregatedKeyword[]
  minedKeywords: AggregatedKeyword[]
  aba: AbaKeywordEvidence[]
  competitors: CompetitorEvidence[]
  markets: MarketEvidence[]
  reviewItems: ReviewItem[]
  reviews: ReviewEvidence
}

export type ResearchJob = {
  id: string
  input: ResearchInput
  status: 'idle' | 'running' | 'complete' | 'partial' | 'failed' | 'cancelled'
  currentStage: ResearchStageId | null
  stages: Record<ResearchStageId, ResearchStageState>
  budget: ResearchBudget
  usedBudget: ResearchBudget
  evidence: ResearchEvidence
  decision: ResearchDecision | null
  candidateDecisions: CandidateResearchDecision[]
  errors: string[]
  startedAt: number
  completedAt: number | null
}

export type ResearchFailureKind = 'authentication' | 'permission' | 'rate-limit' | 'contract' | 'network' | 'unavailable' | 'unknown'

export class ResearchPortError extends Error {
  constructor(
    public readonly kind: ResearchFailureKind,
    message: string,
    public readonly fatal = kind === 'authentication' || kind === 'permission' || kind === 'contract',
  ) {
    super(message)
    this.name = 'ResearchPortError'
  }
}
