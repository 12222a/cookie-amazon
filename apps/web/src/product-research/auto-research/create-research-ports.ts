import {
  SELLERSPRITE_MARKET_RECENT_30_DAYS,
  type SellerSpriteAbaPeriodsData,
  type SellerSpriteAbaResearchData,
  type SellerSpriteCompetitorData,
  type SellerSpriteKeywordMiningData,
  type SellerSpriteKeywordReverseData,
  type SellerSpriteMarketResearchData,
  type SellerSpriteProductSelectionData,
  type SellerSpriteReviewCommentsData,
} from '@cookie-amazon/protocol'
import {
  ResearchPortError,
  type AbaPeriod,
  type ResearchFailureKind,
  type ResearchPorts,
} from '@cookie-amazon/research-core'
import {
  WebSdkError,
  listSellerSpriteAbaPeriods,
  listSellerSpriteReviewComments,
  mineSellerSpriteKeywords,
  researchSellerSpriteAba,
  researchSellerSpriteCompetitors,
  researchSellerSpriteMarket,
  reverseSellerSpriteKeywords,
  selectSellerSpriteProducts,
} from '@cookie-amazon/web-sdk'
import {
  buildKeywordMiningInput,
  buildKeywordReverseInput,
  buildMarketResearchInput,
} from '../input'
import {
  buildP0ProductSelectionInput,
  buildP0ReviewCommentsInput,
  rankP0Candidates,
} from '../p0-opportunity'

const TIMEOUT = { timeoutMs: 20_000 }

export type ResearchSdkDependencies = {
  selectProducts: typeof selectSellerSpriteProducts
  reverseKeywords: typeof reverseSellerSpriteKeywords
  mineKeywords: typeof mineSellerSpriteKeywords
  listAbaPeriods: typeof listSellerSpriteAbaPeriods
  researchAba: typeof researchSellerSpriteAba
  researchCompetitors: typeof researchSellerSpriteCompetitors
  researchMarket: typeof researchSellerSpriteMarket
  listReviews: typeof listSellerSpriteReviewComments
}

const DEFAULT_DEPENDENCIES: ResearchSdkDependencies = {
  selectProducts: selectSellerSpriteProducts,
  reverseKeywords: reverseSellerSpriteKeywords,
  mineKeywords: mineSellerSpriteKeywords,
  listAbaPeriods: listSellerSpriteAbaPeriods,
  researchAba: researchSellerSpriteAba,
  researchCompetitors: researchSellerSpriteCompetitors,
  researchMarket: researchSellerSpriteMarket,
  listReviews: listSellerSpriteReviewComments,
}

const abortIfNeeded = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException('Research request aborted', 'AbortError')
}

const failureKind = (code: string): ResearchFailureKind => {
  if (code === 'TARGET_NOT_LOGGED_IN') return 'authentication'
  if (/PERMISSION|FORBIDDEN/.test(code)) return 'permission'
  if (/RATE_LIMIT|429/.test(code)) return 'rate-limit'
  if (/INVALID_MESSAGE|TARGET_RESPONSE_INVALID|UNSUPPORTED_PROTOCOL/.test(code)) return 'contract'
  if (/NETWORK|TIMEOUT|EXTENSION_UNAVAILABLE/.test(code)) return 'network'
  if (/DISABLED|UNAVAILABLE|UNSUPPORTED|UNKNOWN_TARGET|FEATURE/.test(code)) return 'unavailable'
  return 'unknown'
}

const safeErrorText = (value: string, maxLength: number): string =>
  value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)

const webSdkErrorMessage = (error: WebSdkError): string => {
  const details = [
    error.code,
    error.httpStatus === undefined ? null : `HTTP ${error.httpStatus}`,
    error.targetCode === undefined ? null : `上游码 ${safeErrorText(String(error.targetCode), 80)}`,
    error.targetMessage ? safeErrorText(error.targetMessage, 240) : null,
  ].filter((item): item is string => Boolean(item))
  return details.join(' · ')
}

export const toResearchPortError = (reason: unknown): ResearchPortError => {
  if (reason instanceof ResearchPortError) return reason
  if (reason instanceof WebSdkError) {
    const kind = failureKind(reason.code)
    return new ResearchPortError(kind, webSdkErrorMessage(reason))
  }
  if (reason instanceof DOMException && reason.name === 'AbortError') {
    return new ResearchPortError('network', 'REQUEST_ABORTED', false)
  }
  return new ResearchPortError('unknown', reason instanceof Error ? reason.message.slice(0, 160) : 'RESEARCH_REQUEST_FAILED', false)
}

const call = async <T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
  abortIfNeeded(signal)
  try {
    const value = await operation()
    abortIfNeeded(signal)
    return value
  } catch (reason) {
    throw toResearchPortError(reason)
  }
}

const mapCandidates = (data: SellerSpriteProductSelectionData) => rankP0Candidates(data.items, 10).map((item) => ({
  asin: item.asin,
  title: item.title ?? item.asin,
  brand: item.brand,
  imageUrl: item.imageUrl,
  estimatedSales: item.estimatedSales,
  salesGrowth: item.salesGrowth ?? null,
  price: item.price,
  rating: item.rating,
  reviews: item.reviews,
  sellers: item.sellers ?? null,
  listingAgeDays: item.availableDays ?? null,
  discoveryScore: item.discoveryScore,
}))

const mapReverseKeywords = (data: SellerSpriteKeywordReverseData) => data.items.map((item) => ({
  keyword: item.keywords,
  searchVolume: item.searches,
  purchaseRate: item.purchaseRate,
  supplyDemandRatio: item.supplyDemandRatio,
  relevancy: item.trafficPercentage,
  rank: item.searchesTrend?.find((point) => point.searchRank !== null)?.searchRank ?? null,
  products: item.products,
}))

const mapMinedKeywords = (data: SellerSpriteKeywordMiningData) => data.items.map((item) => ({
  keyword: item.keyword,
  searchVolume: item.searches,
  purchaseRate: item.purchaseRate,
  supplyDemandRatio: item.supplyDemandRatio,
  relevancy: item.relevancy,
  rank: item.searchRank,
  products: item.products,
  departments: item.departments.map((department) => department.label),
}))

const mapPeriods = (data: SellerSpriteAbaPeriodsData): AbaPeriod[] => [
  ...data.weekTables.map((period) => ({ ...period, type: 'W' as const })),
  ...data.monthTables.map((period) => ({ ...period, type: 'M' as const })),
]

const mapAba = (data: SellerSpriteAbaResearchData, keyword: string, period: AbaPeriod) => {
  const normalized = keyword.trim().toLocaleLowerCase('en-US')
  const item = data.items.find((candidate) => candidate.keyword.trim().toLocaleLowerCase('en-US') === normalized) ?? data.items[0]
  if (!item) return null
  return {
    keyword: item.keyword,
    period,
    searchRank: item.searchRank,
    searches: item.searches,
    purchases: item.purchases,
    purchaseRate: item.purchaseRate,
    products: item.products,
    rankGrowthRate: item.searchRankGrowthRate,
    clickShareRate: item.clickShareRate,
    conversionShareRate: item.cvsShareRate,
  }
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle] ?? null
}

const mapCompetitors = (data: SellerSpriteCompetitorData, keyword: string) => {
  const sales = data.items.map((item) => item.estimatedSales).filter((value): value is number => value !== null && value >= 0)
  const totalSales = sales.reduce((sum, value) => sum + value, 0)
  const top10Sales = [...sales].sort((left, right) => right - left).slice(0, 10).reduce((sum, value) => sum + value, 0)
  const reviews = data.items.map((item) => item.reviews).filter((value): value is number => value !== null && value >= 0)
  const ages = data.items.map((item) => item.availableDays).filter((value): value is number => value !== null && value >= 0)
  return {
    keyword,
    productCount: data.total,
    estimatedSales: totalSales > 0 ? totalSales : null,
    top10SalesConcentration: totalSales > 0 ? top10Sales / totalSales : null,
    medianReviews: median(reviews),
    medianListingAgeDays: median(ages),
    newListingShare: ages.length === 0 ? null : ages.filter((value) => value <= 180).length / ages.length,
  }
}

const average = (values: Array<number | null>): number | null => {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value))
  return valid.length === 0 ? null : valid.reduce((sum, value) => sum + value, 0) / valid.length
}

const mapMarket = (data: SellerSpriteMarketResearchData, keyword: string) => ({
  keyword,
  totalProducts: average(data.rows.map((row) => row.totalProducts)),
  totalSales: average(data.rows.map((row) => row.totalSales)),
  fbaRatio: average(data.rows.map((row) => row.fbaRatio)),
  amzRatio: average(data.rows.map((row) => row.amzRatio)),
  fbmRatio: average(data.rows.map((row) => row.fbmRatio)),
  brandConcentration: average(data.rows.map((row) => row.brandConcentration)),
  sellerConcentration: average(data.rows.map((row) => row.sellerConcentration)),
  newProductShare: average(data.rows.map((row) => row.newProductRatio)),
})

const mapReviews = (data: SellerSpriteReviewCommentsData) => data.items.map((item) => ({
  asin: item.asin,
  star: item.star,
  title: item.title,
  content: item.content,
  variation: item.skus,
  likes: item.likes,
}))

const ABA_MARKETS: Readonly<Record<string, 'COM' | 'CA' | 'GB' | 'DE' | 'FR' | 'JP' | 'IT' | 'ES' | 'IN' | 'MX'>> = {
  US: 'COM', CA: 'CA', GB: 'GB', DE: 'DE', FR: 'FR', JP: 'JP', IT: 'IT', ES: 'ES', IN: 'IN', MX: 'MX',
}

export const createSellerSpriteResearchPorts = (
  dependencies: Partial<ResearchSdkDependencies> = {},
): ResearchPorts => {
  const sdk = { ...DEFAULT_DEPENDENCIES, ...dependencies }
  return {
    products: {
      discover: async (input, options) => mapCandidates(await call(
        () => sdk.selectProducts(buildP0ProductSelectionInput(input.market, input.categoryId), TIMEOUT),
        options?.signal,
      )),
    },
    reverseKeywords: {
      reverse: async (asin, market, options) => mapReverseKeywords(await call(
        () => sdk.reverseKeywords(buildKeywordReverseInput(asin, market), TIMEOUT),
        options?.signal,
      )),
    },
    keywordMining: {
      mine: async (keyword, market, options) => mapMinedKeywords(await call(
        () => sdk.mineKeywords(buildKeywordMiningInput(keyword, market, 1, 50), TIMEOUT),
        options?.signal,
      )),
    },
    aba: {
      listPeriods: async (_market, options) => mapPeriods(await call(() => sdk.listAbaPeriods(TIMEOUT), options?.signal)),
      research: async (keyword, market, period, options) => {
        const abaMarket = ABA_MARKETS[market]
        if (!abaMarket) throw new ResearchPortError('unavailable', 'UNSUPPORTED_ABA_MARKET', false)
        const data = await call(() => sdk.researchAba({
          reverseType: period.type,
          table: period.table,
          q: keyword,
          market: abaMarket,
          page: 1,
          size: 50,
        }, TIMEOUT), options?.signal)
        return mapAba(data, keyword, period)
      },
    },
    competitors: {
      research: async (keyword, market, options) => mapCompetitors(await call(() => sdk.researchCompetitors({
        asins: [], keywords: keyword, brand: '', seller: '', lowPrice: 'N', market,
        monthName: SELLERSPRITE_MARKET_RECENT_30_DAYS,
        nodeIdPaths: [], order: { desc: true, field: 'amz_unit' }, page: 1, size: 20, symbolFlag: false,
      }, TIMEOUT), options?.signal), keyword),
    },
    market: {
      research: async (keyword, market, options) => mapMarket(await call(
        () => sdk.researchMarket(buildMarketResearchInput(keyword, market, SELLERSPRITE_MARKET_RECENT_30_DAYS, 6), TIMEOUT),
        options?.signal,
      ), keyword),
    },
    reviews: {
      list: async (asin, market, query, options) => {
        const base = buildP0ReviewCommentsInput(asin, market)
        return mapReviews(await call(() => sdk.listReviews({
          ...base,
          pageNum: query?.page ?? 1,
          pageSize: query?.pageSize ?? 20,
          starList: query?.stars ?? [],
        }, TIMEOUT), options?.signal))
      },
    },
  }
}