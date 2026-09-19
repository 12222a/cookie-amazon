import type { ResearchPolicy } from './policy'
import type {
  AbaKeywordEvidence,
  AbaPeriod,
  CompetitorEvidence,
  KeywordMetric,
  MarketEvidence,
  ProductCandidate,
  ResearchInput,
  ReviewItem,
} from './model'

export type PortOptions = { signal?: AbortSignal }

export interface ProductDiscoveryPage {
  page: number
  pages: number
  total: number
  hasNextPage: boolean
  items: ProductCandidate[]
}

export interface ProductDiscoveryPort {
  discover(input: ResearchInput, options?: PortOptions): Promise<ProductCandidate[]>
  discoverPage?(input: ResearchInput, page: number, options?: PortOptions): Promise<ProductDiscoveryPage>
}

export interface KeywordReversePort {
  reverse(asin: string, market: string, options?: PortOptions): Promise<KeywordMetric[]>
}

export interface KeywordMiningPort {
  mine(keyword: string, market: string, options?: PortOptions): Promise<KeywordMetric[]>
}

export interface AbaResearchPort {
  listPeriods(market: string, options?: PortOptions): Promise<AbaPeriod[]>
  research(keyword: string, market: string, period: AbaPeriod, options?: PortOptions): Promise<AbaKeywordEvidence | null>
}

export interface CompetitorResearchPort {
  research(keyword: string, market: string, options?: PortOptions): Promise<CompetitorEvidence | null>
}

export interface MarketResearchPort {
  research(keyword: string, market: string, options?: PortOptions): Promise<MarketEvidence | null>
}

export type ReviewQuery = { page?: number; pageSize?: number; stars?: number[] }

export interface ReviewResearchPort {
  list(asin: string, market: string, query?: ReviewQuery, options?: PortOptions): Promise<ReviewItem[]>
}

export type ResearchPorts = {
  products: ProductDiscoveryPort
  reverseKeywords: KeywordReversePort
  keywordMining?: KeywordMiningPort
  aba?: AbaResearchPort
  competitors?: CompetitorResearchPort
  market?: MarketResearchPort
  reviews?: ReviewResearchPort
}

export type ResearchPipelineOptions = {
  jobId?: string
  policy?: ResearchPolicy
  signal?: AbortSignal
  now?: () => number
  onUpdate?: (job: import('./model').ResearchJob) => void
}