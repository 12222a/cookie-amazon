import {
  SELLERSPRITE_ORIGIN,
  SELLERSPRITE_TARGET_ID,
} from '@cookie-amazon/sellersprite'
import {
  isSellerSpriteAbaResearchInput,
  isSellerSpriteMarketResearchInput,
} from '@cookie-amazon/protocol'
import type {
  SellerSpriteKeywordItem,
  SellerSpriteKeywordReverseData,
  SellerSpriteKeywordReverseInput,
  SellerSpriteMonthlyData,
  SellerSpriteMonthlyInput,
  SellerSpriteMonthlyVariation,
  SellerSpriteMarketResearchData,
  SellerSpriteMarketResearchInput,
  SellerSpriteMarketResearchRow,
  SellerSpriteKeywordTrend,
  SellerSpriteCompetitorData,
  SellerSpriteCompetitorInput,
  SellerSpriteCompetitorItem,
  SellerSpriteProductSelectionData,
  SellerSpriteProductSelectionInput,
  SellerSpriteHtmlSessionData,
  SellerSpriteKeywordMiningData,
  SellerSpriteKeywordMiningInput,
  SellerSpriteAbaItem,
  SellerSpriteAbaPeriodsData,
  SellerSpriteAbaResearchData,
  SellerSpriteAbaResearchInput,
} from '@cookie-amazon/protocol'
import { createTargetAdapter } from './adapter'
import { TargetClient, TargetClientError } from './client'
import { createSellerSpriteOperationPolicy } from './policy'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readNullableNumber = (value: unknown): number | null | undefined => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value.replaceAll(',', ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

const readKeywordTrend = (value: unknown): SellerSpriteKeywordTrend | undefined => {
  if (!isRecord(value)) return undefined
  const month = typeof value.month === 'string' ? value.month : typeof value.dk === 'string' ? value.dk : undefined
  if (month === undefined) return undefined
  const searchRank = readNullableNumber(value.searchRank ?? value.rank)
  const searches = readNullableNumber(value.searches ?? value.sales)
  return searchRank === undefined || searches === undefined
    ? undefined
    : { month, searchRank, searches }
}

const readKeywordItem = (value: unknown): SellerSpriteKeywordItem | undefined => {
  if (!isRecord(value)) return undefined
  const keywords = typeof value.keywords === 'string'
    ? value.keywords
    : typeof value.keyword === 'string' ? value.keyword : undefined
  if (keywords === undefined) return undefined
  let searchesTrend: SellerSpriteKeywordTrend[] | null
  if (value.searchesTrend === null || value.searchesTrend === undefined) {
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
    keywords,
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
  if (!isRecord(payload)
    || (payload.code !== 'OK' && payload.code !== 0 && payload.code !== 200)
    || !isRecord(payload.data)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const total = normalizeNullableNumber(payload.data.total)
  const rawItems = payload.data.items
  if (typeof payload.data.asin !== 'string'
    || total === null
    || total < 0
    || (rawItems !== null && rawItems !== undefined && !Array.isArray(rawItems))) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const items = (rawItems ?? []).map(readKeywordItem)
  if (items.some((item) => item === undefined)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  return {
    asin: payload.data.asin,
    total,
    items: items as SellerSpriteKeywordItem[],
  }
}

export const reverseSellerSpriteKeywords = (
  client: TargetClient,
  input: SellerSpriteKeywordReverseInput,
): Promise<SellerSpriteKeywordReverseData> => {
  const {
    asin,
    marketId,
    month,
    forceReStat,
    badges,
    limit,
  } = input
  return client.executeJsonPost(
    'SELLERSPRITE_KEYWORD_REVERSE',
    {},
    { asin, marketId, month, forceReStat, badges, limit },
    readKeywordReverseResponse,
  )
}

const readAbaEnvelope = async (response: Response): Promise<Record<string, unknown>> => {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    if (response.status === 401 || response.status === 403) {
      throw new TargetClientError('TARGET_NOT_LOGGED_IN', response.status)
    }
    if (response.status === 429) throw new TargetClientError('TARGET_RATE_LIMITED', response.status)
    if (!response.ok) throw new TargetClientError('TARGET_API_ERROR', response.status)
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const details = isRecord(payload)
    ? {
        ...(typeof payload.code === 'string' || typeof payload.code === 'number' ? { targetCode: payload.code } : {}),
        ...(typeof payload.message === 'string' ? { targetMessage: payload.message.slice(0, 512) } : {}),
      }
    : {}
  if (response.status === 401 || response.status === 403) {
    throw new TargetClientError('TARGET_NOT_LOGGED_IN', response.status, details)
  }
  if (response.status === 429) throw new TargetClientError('TARGET_RATE_LIMITED', response.status, details)
  if (!response.ok) throw new TargetClientError('TARGET_API_ERROR', response.status, details)
  if (!isRecord(payload)) throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  if (payload.code !== 'OK' && payload.code !== 0 && payload.code !== 200) {
    throw new TargetClientError('TARGET_API_ERROR', response.status, details)
  }
  if (!isRecord(payload.data)) throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  return payload.data
}

const readAbaPeriod = (value: unknown): { table: string; label: string } | undefined => {
  if (!isRecord(value) || typeof value.table !== 'string' || typeof value.label !== 'string') return undefined
  if (!/^ara_\d{6}(?:\d{2})?$/.test(value.table) || value.label.length === 0 || value.label.length > 64) return undefined
  return { table: value.table, label: value.label }
}

const readAbaPeriodsResponse = async (response: Response): Promise<SellerSpriteAbaPeriodsData> => {
  const data = await readAbaEnvelope(response)
  if (!Array.isArray(data.weekTables) || !Array.isArray(data.monthTables)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const weekTables = data.weekTables.map(readAbaPeriod)
  const monthTables = data.monthTables.map(readAbaPeriod)
  if (weekTables.some((period) => period === undefined) || monthTables.some((period) => period === undefined)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  return {
    weekTables: (weekTables as SellerSpriteAbaPeriodsData['weekTables']).filter((period) => /^ara_\d{8}$/.test(period.table)),
    monthTables: (monthTables as SellerSpriteAbaPeriodsData['monthTables']).filter((period) => /^ara_\d{6}$/.test(period.table)),
  }
}

export const listSellerSpriteAbaPeriods = (
  client: TargetClient,
): Promise<SellerSpriteAbaPeriodsData> => client.executeJsonGet(
  'SELLERSPRITE_ABA_PERIODS',
  {},
  readAbaPeriodsResponse,
)

const readAbaItem = (value: unknown): SellerSpriteAbaItem | undefined => {
  if (!isRecord(value) || typeof value.keyword !== 'string' || value.keyword.trim() === '') return undefined
  const departments = Array.isArray(value.departments)
    ? value.departments.filter((item): item is string => typeof item === 'string' && item.length > 0).slice(0, 50)
    : []
  return {
    keyword: value.keyword.slice(0, 512),
    keywordCn: typeof value.keywordCn === 'string' ? value.keywordCn.slice(0, 512) : null,
    keywordJp: typeof value.keywordJp === 'string' ? value.keywordJp.slice(0, 512) : null,
    searches: normalizeNullableNumber(value.searches),
    clicks: normalizeNullableNumber(value.clicks),
    impressions: normalizeNullableNumber(value.impressions),
    purchaseRate: normalizeNullableNumber(value.purchaseRate),
    purchases: normalizeNullableNumber(value.purchases),
    products: normalizeNullableNumber(value.products),
    departments,
    searchRank: normalizeNullableNumber(value.searchRank),
    searchRankGrowthValue: normalizeNullableNumber(value.searchRankGrowthValue),
    searchRankGrowthRate: normalizeNullableNumber(value.searchRankGrowthRate),
    cvsShareRate: normalizeNullableNumber(value.cvsShareRate),
    clickShareRate: normalizeNullableNumber(value.clickShareRate),
  }
}

const readAbaResearchResponse = async (response: Response): Promise<SellerSpriteAbaResearchData> => {
  const data = await readAbaEnvelope(response)
  const page = normalizeNullableNumber(data.page)
  const pages = normalizeNullableNumber(data.pages)
  const size = normalizeNullableNumber(data.size)
  const total = normalizeNullableNumber(data.total)
  const took = normalizeNullableNumber(data.took)
  if (page === null || pages === null || size === null || total === null
    || !Number.isInteger(page) || page < 1 || !Number.isInteger(pages) || pages < 0
    || !Number.isInteger(size) || size < 1 || total < 0
    || (data.items !== null && data.items !== undefined && !Array.isArray(data.items))) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const items = (data.items ?? []).map(readAbaItem).filter((item): item is SellerSpriteAbaItem => item !== undefined).slice(0, 50)
  return { page, pages, size, total, took, hasNextPage: page < pages && items.length > 0, items }
}

export const researchSellerSpriteAba = (
  client: TargetClient,
  input: SellerSpriteAbaResearchInput,
): Promise<SellerSpriteAbaResearchData> => {
  if (!isSellerSpriteAbaResearchInput(input)) throw new TargetClientError('TARGET_API_ERROR')
  return client.executeJsonPost(
    'SELLERSPRITE_ABA_RESEARCH',
    {},
    {
      rankGrowthType: 'W1',
      size: input.size,
      page: input.page,
      market: input.market,
      q: input.q,
      table: input.table,
      reverseType: input.reverseType,
      departments: [],
      keywordBidMatchType: 'exact',
      order: { field: 'searchfrequencyrank', desc: false },
    },
    readAbaResearchResponse,
  )
}

const readMonthlyVariation = (value: unknown): SellerSpriteMonthlyVariation | undefined => {
  if (!isRecord(value) || typeof value.asin !== 'string' || value.asin.trim() === '') return undefined
  return {
    asin: value.asin,
    availableDate: normalizeNullableNumber(value.availableDate),
    availableDays: normalizeNullableNumber(value.availableDays),
    bsrLabel: normalizeNullableString(value.bsrLabel),
    bsrRank: normalizeNullableNumber(value.bsrRank),
    currency: normalizeNullableString(value.currency),
    price: normalizeNullableNumber(value.price),
    rating: normalizeNullableNumber(value.rating),
    reviews: normalizeNullableNumber(value.reviews),
    reviewsRate: normalizeNullableNumber(value.reviewsRate),
    station: normalizeNullableString(value.station),
    title: normalizeNullableString(value.title),
  }
}

const readMonthlyResponse = async (response: Response): Promise<SellerSpriteMonthlyData> => {
  if (response.status === 401 || response.status === 403) throw new TargetClientError('TARGET_NOT_LOGGED_IN', response.status)
  if (response.status === 429) throw new TargetClientError('TARGET_RATE_LIMITED', response.status)
  if (!response.ok) throw new TargetClientError('TARGET_API_ERROR', response.status)
  let payload: unknown
  try { payload = await response.json() } catch { throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status) }
  if (!isRecord(payload)
    || (payload.code !== 'OK' && payload.code !== 0 && payload.code !== 200)
    || !isRecord(payload.data)
    || !Array.isArray(payload.data.variations)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const variations = payload.data.variations.map(readMonthlyVariation)
  if (variations.some((item) => item === undefined)) throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  return { variations: variations as SellerSpriteMonthlyVariation[], historyStatus: 'not-verified' }
}

export const readSellerSpriteMonthly = (
  client: TargetClient,
  input: SellerSpriteMonthlyInput,
): Promise<SellerSpriteMonthlyData> => client.executeJsonGet(
  'SELLERSPRITE_MONTHLY',
  { asin: input.asin, month: input.month, station: input.station },
  readMonthlyResponse,
)

const MARKET_RESEARCH_EMPTY_FIELDS = [
  'minAvgSales', 'maxAvgSales', 'minAvgBsr', 'maxAvgBsr', 'minAvgWeight', 'maxAvgWeight',
  'minHeadListingAvgBsr', 'maxHeadListingAvgBsr', 'minTotalProducts', 'maxTotalProducts',
  'minAvgRevenue', 'maxAvgRevenue', 'minAvgPrice', 'maxAvgPrice', 'minAvgVolume', 'maxAvgVolume',
  'minHeadListingAvgSales', 'maxHeadListingAvgSales', 'minAvgReviews', 'maxAvgReviews',
  'minAvgRating', 'maxAvgRating', 'minAvgProfit', 'maxAvgProfit', 'minHeadListingAvgRevenue',
  'maxHeadListingAvgRevenue', 'minBrands', 'maxBrands', 'minHeadListingProductCrn',
  'maxHeadListingProductCrn', 'minEbcRatio', 'maxEbcRatio', 'minAmzRatio', 'maxAmzRatio',
  'minSellers', 'maxSellers', 'minHeadListingBrandCrn', 'maxHeadListingBrandCrn', 'minFbaRatio',
  'maxFbaRatio', 'sellerNations', 'minAvgSellers', 'maxAvgSellers', 'minHeadListingSellerCrn',
  'maxHeadListingSellerCrn', 'minFbmRatio', 'maxFbmRatio', 'minNewRatio', 'maxNewRatio',
  'minNewAvgPrice', 'maxNewAvgPrice', 'minNewAvgRevenue', 'maxNewAvgRevenue', 'minNewCount',
  'maxNewCount', 'minNewAvgRating', 'maxNewAvgRating', 'minNewAvgReviews', 'maxNewAvgReviews',
  'minNewAvgSales', 'maxNewAvgSales',
] as const

const buildMarketResearchForm = (
  input: SellerSpriteMarketResearchInput,
): Readonly<Record<string, string>> => {
  if (!isSellerSpriteMarketResearchInput(input)) throw new TargetClientError('TARGET_API_ERROR')
  return {
    marketId: String(input.marketId),
    nodeIdPath: '',
    sampleNumber: '1',
    topn: '10',
    newReleaseNum: String(input.newReleaseNum),
    'order.field': 'total_sales',
    'order.desc': 'true',
    tab: '1',
    monthName: input.monthName,
    newReleaseNumSelect: String(input.newReleaseNum),
    topNSelect: '10',
    departmentKeyword: input.departmentKeyword,
    ...Object.fromEntries(MARKET_RESEARCH_EMPTY_FIELDS.map((field) => [field, ''])),
  }
}

const decodeHtmlEntities = (value: string): string => value.replace(
  /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
  (entity, decimal: string | undefined, hex: string | undefined, named: string | undefined) => {
    if (decimal) return String.fromCodePoint(Number(decimal))
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16))
    const entities: Readonly<Record<string, string>> = {
      amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
    }
    return entities[named?.toLowerCase() ?? ''] ?? entity
  },
)

const htmlText = (value: string): string => decodeHtmlEntities(value
  .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, ' ')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ')
  .trim()

const numbersIn = (value: string): number[] => (value.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? [])
  .map((item) => Number(item.replaceAll(',', '')))
  .filter(Number.isFinite)

const numberAt = (values: readonly number[], index: number): number | null => values[index] ?? null
const ratioAt = (values: readonly number[], index: number): number | null => {
  const value = values[index]
  return value === undefined ? null : value / 100
}

const parseMarketResearchRow = (cells: readonly string[]): SellerSpriteMarketResearchRow | undefined => {
  if (cells.length !== 15 || !/^\s*\d+\s*$/.test(htmlText(cells[0] ?? ''))) return undefined
  const marketAnchor = (cells[1] ?? '').match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1]
  const marketName = htmlText(marketAnchor ?? '')
  if (marketName === '') return undefined
  const sample = numbersIn(htmlText(cells[2] ?? ''))
  const sales = numbersIn(htmlText(cells[4] ?? ''))
  const revenue = numbersIn(htmlText(cells[5] ?? ''))
  const rating = numbersIn(htmlText(cells[6] ?? ''))
  const bsr = numbersIn(htmlText(cells[7] ?? ''))
  const sellerPrice = numbersIn(htmlText(cells[8] ?? ''))
  const sellerTypes = numbersIn(htmlText(cells[9] ?? ''))
  const concentration = numbersIn(htmlText(cells[10] ?? ''))
  const newProducts = numbersIn(htmlText(cells[11] ?? ''))
  return {
    marketName,
    sampleProducts: numberAt(sample, 0),
    sampleBrands: numberAt(sample, 1),
    sampleSellers: numberAt(sample, 2),
    totalSales: numberAt(numbersIn(htmlText(cells[3] ?? '')), 0),
    averageSales: numberAt(sales, 0),
    headSales: numberAt(sales, 1),
    averageRevenue: numberAt(revenue, 0),
    headRevenue: numberAt(revenue, 1),
    averageReviews: numberAt(rating, 0),
    averageRating: numberAt(rating, 1),
    averageBsr: numberAt(bsr, 0),
    headBsr: numberAt(bsr, 1),
    averageSellers: numberAt(sellerPrice, 0),
    averagePrice: numberAt(sellerPrice, 1),
    fbaRatio: ratioAt(sellerTypes, 0),
    amzRatio: ratioAt(sellerTypes, 1),
    fbmRatio: ratioAt(sellerTypes, 2),
    productConcentration: ratioAt(concentration, 0),
    brandConcentration: ratioAt(concentration, 1),
    sellerConcentration: ratioAt(concentration, 2),
    newProductCount: numberAt(newProducts, 0),
    newProductRatio: ratioAt(newProducts, 1),
    totalProducts: numberAt(numbersIn(htmlText(cells[12] ?? '')), 0),
    profit: null,
  }
}

const coverageRatio = (
  rows: readonly SellerSpriteMarketResearchRow[],
  covered: (row: SellerSpriteMarketResearchRow) => boolean,
): number => rows.length === 0 ? 0 : rows.filter(covered).length / rows.length

export const parseSellerSpriteMarketResearchHtml = (html: string): SellerSpriteMarketResearchData => {
  if (html.length > 2_000_000) throw new TargetClientError('TARGET_RESPONSE_INVALID')
  const tableStart = html.search(/<table\b[^>]*\bid=["']table-condition-search["'][^>]*>/i)
  if (tableStart < 0) throw new TargetClientError('TARGET_RESPONSE_INVALID')
  const tableEnd = html.indexOf('</table>', tableStart)
  if (tableEnd < 0) throw new TargetClientError('TARGET_RESPONSE_INVALID')
  const table = html.slice(tableStart, tableEnd + 8)
  const rawRows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1] ?? '')
  const rawCells = rawRows.map((row) => [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map((match) => match[1] ?? ''))
  const headers = (rawCells[0] ?? []).map(htmlText)
  const expectedHeaderPrefixes = [
    '#', '细分市场', '样本数量', '月总销量', '月均销量 头部商品', '月均销售额 头部商品',
    '平均评分数 平均星级', '平均BSR 头部商品', '平均卖家数 平均价格', '卖家类型',
    '集中度指标', '新品数量 新品占比', '商品总数', '退货率', '操作',
  ]
  if (headers.length !== expectedHeaderPrefixes.length
    || !expectedHeaderPrefixes.every((prefix, index) => headers[index]?.startsWith(prefix))) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID')
  }
  const rows = rawCells.slice(1).map(parseMarketResearchRow)
    .filter((row): row is SellerSpriteMarketResearchRow => row !== undefined)
    .slice(0, 100)
  return {
    rows,
    fieldCoverage: {
      sampleCounts: coverageRatio(rows, (row) => row.sampleProducts !== null && row.sampleBrands !== null && row.sampleSellers !== null),
      totalSales: coverageRatio(rows, (row) => row.totalSales !== null),
      averageSales: coverageRatio(rows, (row) => row.averageSales !== null && row.headSales !== null),
      averageRevenue: coverageRatio(rows, (row) => row.averageRevenue !== null && row.headRevenue !== null),
      rating: coverageRatio(rows, (row) => row.averageReviews !== null && row.averageRating !== null),
      bsr: coverageRatio(rows, (row) => row.averageBsr !== null && row.headBsr !== null),
      price: coverageRatio(rows, (row) => row.averagePrice !== null),
      sellerTypes: coverageRatio(rows, (row) => row.fbaRatio !== null && row.amzRatio !== null && row.fbmRatio !== null),
      concentration: coverageRatio(rows, (row) => row.productConcentration !== null && row.brandConcentration !== null && row.sellerConcentration !== null),
      newProducts: coverageRatio(rows, (row) => row.newProductCount !== null && row.newProductRatio !== null),
      totalProducts: coverageRatio(rows, (row) => row.totalProducts !== null),
      profit: 0,
    },
    profitStatus: 'not-integrated',
  }
}

const readMarketResearchResponse = async (response: Response): Promise<SellerSpriteMarketResearchData> => {
  if (response.status === 401 || response.status === 403) throw new TargetClientError('TARGET_NOT_LOGGED_IN', response.status)
  if (response.status === 429) throw new TargetClientError('TARGET_RATE_LIMITED', response.status)
  if (!response.ok) throw new TargetClientError('TARGET_API_ERROR', response.status)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('text/html')) throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  return parseSellerSpriteMarketResearchHtml(await response.text())
}

export const researchSellerSpriteMarket = (
  client: TargetClient,
  input: SellerSpriteMarketResearchInput,
): Promise<SellerSpriteMarketResearchData> => client.executeFormPost(
  'SELLERSPRITE_MARKET_RESEARCH',
  buildMarketResearchForm(input),
  readMarketResearchResponse,
)

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

const normalizeNullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const normalizeNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value.replaceAll(',', ''))
  return Number.isFinite(parsed) ? parsed : null
}

const readProductItem = (value: unknown): SellerSpriteCompetitorItem | undefined => {
  if (!isRecord(value) || typeof value.asin !== 'string' || value.asin.trim() === '') return undefined
  return {
    asin: value.asin,
    title: normalizeNullableString(value.title ?? value.title0),
    brand: normalizeNullableString(value.brand ?? value.brand0),
    imageUrl: normalizeNullableString(value.imageUrl ?? value.imageSrc),
    price: normalizeNullableNumber(value.price),
    rating: normalizeNullableNumber(value.rating),
    reviews: normalizeNullableNumber(value.reviews),
    estimatedSales: normalizeNullableNumber(value.amzUnit ?? value.estimatedSales),
    availableDate: normalizeNullableNumber(value.availableDate),
    availableDays: normalizeNullableNumber(value.availableDays),
  }
}

const readProductPageResponse = async (response: Response) => {
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
  if (!isRecord(payload)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const hasValidCode = !Object.hasOwn(payload, 'code')
    || payload.code === 'OK'
    || payload.code === 0
    || payload.code === 200
  if (!hasValidCode) throw new TargetClientError('TARGET_API_ERROR', response.status)
  if (!isRecord(payload.data)) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const data = payload.data
  const numericKeys = ['page', 'pages', 'size', 'total'] as const
  const numbers = Object.fromEntries(numericKeys.map((key) => [key, readNullableNumber(data[key])])) as Record<(typeof numericKeys)[number], number | null | undefined>
  const rawItems = data.items
  if (Object.values(numbers).some((item) => item === undefined || item === null)
    || (data.hasNextPage !== undefined && data.hasNextPage !== null && typeof data.hasNextPage !== 'boolean')
    || (rawItems !== null && !Array.isArray(rawItems))) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  const items = (rawItems ?? []).map(readProductItem)
  if (items.some((item) => item === undefined)) throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  return {
    page: numbers.page!, pages: numbers.pages!, size: numbers.size!, total: numbers.total!,
    hasNextPage: rawItems !== null && (data.hasNextPage ?? numbers.page! < numbers.pages!),
    items: items as SellerSpriteCompetitorItem[],
  }
}

export const researchSellerSpriteCompetitors = (
  client: TargetClient,
  input: SellerSpriteCompetitorInput,
): Promise<SellerSpriteCompetitorData> => client.executeJsonPost(
  'COMPETITOR_RESEARCH',
  {},
  input,
  readProductPageResponse,
)
export const selectSellerSpriteProducts = (
  client: TargetClient,
  input: SellerSpriteProductSelectionInput,
): Promise<SellerSpriteProductSelectionData> => client.executeJsonPost(
  'PRODUCT_SELECTION',
  {},
  {
    eligibility: input.eligibility,
    filterSub: input.filterSub,
    lowPrice: input.lowPrice,
    market: input.market,
    monthName: input.monthName,
    nodeIdPaths: input.nodeIdPaths,
    order: input.order,
    page: input.page,
    pkgDimensionTypeList: input.pkgDimensionTypeList,
    productTags: input.productTags,
    salesGrowthType: input.salesGrowthType,
    selectType: input.selectType,
    sellerNationList: input.sellerNationList,
    sellerTypes: input.sellerTypes,
    size: input.size,
    symbolFlag: input.symbolFlag,
    video: input.video,
    weightUnit: input.weightUnit,
  },
  readProductPageResponse,
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