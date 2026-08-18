import {
  SELLERSPRITE_ORIGIN,
  SELLERSPRITE_TARGET_ID,
} from '@cookie-amazon/sellersprite'
import type {
  SellerSpriteKeywordItem,
  SellerSpriteKeywordReverseData,
  SellerSpriteKeywordReverseInput,
  SellerSpriteKeywordTrend,
  SellerSpriteCompetitorData,
  SellerSpriteCompetitorInput,
  SellerSpriteCompetitorItem,
  SellerSpriteProductSelectionData,
  SellerSpriteProductSelectionInput,
  SellerSpriteHtmlSessionData,
  SellerSpriteKeywordMiningData,
  SellerSpriteKeywordMiningInput,
} from '@cookie-amazon/protocol'
import { createTargetAdapter } from './adapter'
import { TargetClient, TargetClientError } from './client'
import { createSellerSpriteOperationPolicy } from './policy'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readNullableNumber = (value: unknown): number | null | undefined =>
  value === null ? null : typeof value === 'number' && Number.isFinite(value) ? value : undefined

const readKeywordTrend = (value: unknown): SellerSpriteKeywordTrend | undefined => {
  if (!isRecord(value) || typeof value.month !== 'string') return undefined
  const searchRank = readNullableNumber(value.searchRank)
  const searches = readNullableNumber(value.searches)
  return searchRank === undefined || searches === undefined
    ? undefined
    : { month: value.month, searchRank, searches }
}

const readKeywordItem = (value: unknown): SellerSpriteKeywordItem | undefined => {
  if (!isRecord(value) || typeof value.keywords !== 'string') return undefined
  let searchesTrend: SellerSpriteKeywordTrend[] | null
  if (value.searchesTrend === null) {
    searchesTrend = null
  } else if (Array.isArray(value.searchesTrend)) {
    const parsedTrends = value.searchesTrend.map(readKeywordTrend)
    if (parsedTrends.some((item) => item === undefined)) return undefined
    searchesTrend = parsedTrends as SellerSpriteKeywordTrend[]
  } else {
    return undefined
  }
  const numericKeys = [
    'searches', 'products', 'supplyDemandRatio', 'trafficPercentage', 'purchaseRate',
    'bid', 'bidMin', 'bidMax', 'avgPrice', 'avgRating', 'avgReviews',
  ] as const
  const numbers = Object.fromEntries(numericKeys.map((key) => [key, readNullableNumber(value[key])])) as Record<(typeof numericKeys)[number], number | null | undefined>
  if (Object.values(numbers).some((item) => item === undefined)) return undefined
  return {
    keywords: value.keywords,
    searches: numbers.searches!,
    products: numbers.products!,
    supplyDemandRatio: numbers.supplyDemandRatio!,
    trafficPercentage: numbers.trafficPercentage!,
    purchaseRate: numbers.purchaseRate!,
    bid: numbers.bid!,
    bidMin: numbers.bidMin!,
    bidMax: numbers.bidMax!,
    avgPrice: numbers.avgPrice!,
    avgRating: numbers.avgRating!,
    avgReviews: numbers.avgReviews!,
    searchesTrend,
  }
}

const readKeywordReverseResponse = async (response: Response): Promise<SellerSpriteKeywordReverseData> => {
  if (response.status === 401 || response.status === 403) {
    throw new TargetClientError('TARGET_NOT_LOGGED_IN', response.status)
  }
  if (response.status === 429) throw new TargetClientError('TARGET_RATE_LIMITED', response.status)
  if (!response.ok) throw new TargetClientError('TARGET_API_ERROR', response.status)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const hasValidCode = typeof payload === 'object'
    && payload !== null
    && 'code' in payload
    && (typeof payload.code === 'string'
      || (typeof payload.code === 'number' && Number.isFinite(payload.code)))
  if (!isRecord(payload)
    || !hasValidCode
    || !isRecord(payload.data)
    || typeof payload.data.asin !== 'string'
    || !Array.isArray(payload.data.items)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const items = payload.data.items.map(readKeywordItem)
  if (items.some((item) => item === undefined)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  return { asin: payload.data.asin, items: items as SellerSpriteKeywordItem[] }
}

export const reverseSellerSpriteKeywords = (
  client: TargetClient,
  input: SellerSpriteKeywordReverseInput,
): Promise<SellerSpriteKeywordReverseData> => {
  const {
    market,
    ac,
    asin,
    badges,
    conversionKeywordTypes,
    desc,
    exactly,
    filterDeletedKeywords,
    keywordBidMatchType,
    limit,
    month,
    order,
    skip,
    trafficKeywordTypes,
  } = input
  return client.executeJsonPost(
    'SELLERSPRITE_KEYWORD_REVERSE',
    { market },
    {
      ac,
      asin,
      badges,
      conversionKeywordTypes,
      desc,
      exactly,
      filterDeletedKeywords,
      keywordBidMatchType,
      limit,
      month,
      order,
      skip,
      trafficKeywordTypes,
    },
    readKeywordReverseResponse,
  )
}

const readKeywordMiningResponse = async (response: Response): Promise<SellerSpriteKeywordMiningData> => {
  if (response.status === 401 || response.status === 403) {
    throw new TargetClientError('TARGET_NOT_LOGGED_IN', response.status)
  }
  if (response.status === 429) throw new TargetClientError('TARGET_RATE_LIMITED', response.status)
  if (!response.ok) throw new TargetClientError('TARGET_API_ERROR', response.status)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const data = payload.data
  if (Object.keys(data).length !== 5
    || !Array.isArray(data.items)
    || data.items.length !== 0
    || typeof data.page !== 'number' || !Number.isFinite(data.page)
    || typeof data.size !== 'number' || !Number.isFinite(data.size)
    || typeof data.took !== 'number' || !Number.isFinite(data.took)
    || typeof data.total !== 'number' || !Number.isFinite(data.total)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  return { items: [], page: data.page, size: data.size, took: data.took, total: data.total }
}

export const mineSellerSpriteKeywords = (
  client: TargetClient,
  input: SellerSpriteKeywordMiningInput,
): Promise<SellerSpriteKeywordMiningData> => client.executeJsonPost(
  'KEYWORD_MINING',
  {},
  input,
  readKeywordMiningResponse,
)
const readNullableString = (value: unknown): string | null | undefined =>
  value === null || value === undefined ? null : typeof value === 'string' ? value : undefined

const readCompetitorItem = (value: unknown): SellerSpriteCompetitorItem | undefined => {
  if (!isRecord(value) || typeof value.asin !== 'string') return undefined
  const title = readNullableString(value.title)
  const brand = readNullableString(value.brand)
  const imageUrl = readNullableString(value.imageUrl)
  const price = readNullableNumber(value.price)
  const rating = readNullableNumber(value.rating)
  const reviews = readNullableNumber(value.reviews)
  const estimatedSales = readNullableNumber(value.estimatedSales)
  return [title, brand, imageUrl, price, rating, reviews, estimatedSales].some((item) => item === undefined)
    ? undefined
    : { asin: value.asin, title: title!, brand: brand!, imageUrl: imageUrl!, price: price!, rating: rating!, reviews: reviews!, estimatedSales: estimatedSales! }
}

const readCompetitorResponse = async (response: Response): Promise<SellerSpriteCompetitorData> => {
  if (response.status === 401 || response.status === 403) {
    throw new TargetClientError('TARGET_NOT_LOGGED_IN', response.status)
  }
  if (response.status === 429) throw new TargetClientError('TARGET_RATE_LIMITED', response.status)
  if (!response.ok) throw new TargetClientError('TARGET_API_ERROR', response.status)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const data = payload.data
  const numericKeys = ['page', 'pages', 'size', 'total'] as const
  const numbers = Object.fromEntries(numericKeys.map((key) => [key, readNullableNumber(data[key])])) as Record<(typeof numericKeys)[number], number | null | undefined>
  if (Object.values(numbers).some((item) => item === undefined || item === null)
    || typeof data.hasNextPage !== 'boolean'
    || !Array.isArray(data.items)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const items = data.items.map(readCompetitorItem)
  if (items.some((item) => item === undefined)) throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  return {
    page: numbers.page!, pages: numbers.pages!, size: numbers.size!, total: numbers.total!,
    hasNextPage: data.hasNextPage, items: items as SellerSpriteCompetitorItem[],
  }
}

export const researchSellerSpriteCompetitors = (
  client: TargetClient,
  input: SellerSpriteCompetitorInput,
): Promise<SellerSpriteCompetitorData> => client.executeJsonPost(
  'COMPETITOR_RESEARCH',
  {},
  input,
  readCompetitorResponse,
)
export const selectSellerSpriteProducts = (
  client: TargetClient,
  input: SellerSpriteProductSelectionInput,
): Promise<SellerSpriteProductSelectionData> => client.executeJsonPost(
  'PRODUCT_SELECTION',
  {},
  input,
  readCompetitorResponse,
)

export const executeSellerSpriteMarketSelection = async (
  client: TargetClient,
): Promise<SellerSpriteHtmlSessionData> => {
  const metadata = await client.executeHtmlSession('MARKET_SELECTION')
  return { targetId: SELLERSPRITE_TARGET_ID, completed: metadata.status >= 200 && metadata.status < 300 }
}

export const executeSellerSpriteKeywordProductResearch = async (
  client: TargetClient,
): Promise<SellerSpriteHtmlSessionData> => {
  const metadata = await client.executeHtmlSession('KEYWORD_PRODUCT_RESEARCH')
  return { targetId: SELLERSPRITE_TARGET_ID, completed: metadata.status >= 200 && metadata.status < 300 }
}

export const SELLERSPRITE_ADAPTER = createTargetAdapter({
  targetId: SELLERSPRITE_TARGET_ID,
  displayName: '卖家精灵',
  origin: SELLERSPRITE_ORIGIN,
  operations: createSellerSpriteOperationPolicy(),
  checkLogin: (client) => client.executeHtmlLoginProbe(),
  getProfile: async () => {
    throw new TargetClientError('OPERATION_DISABLED')
  },
})