import {
  SELLERSPRITE_MARKET_RECENT_30_DAYS,
  getSellerSpriteMarketResearchMonths,
  isSellerSpriteMarketResearchMonth,
  isSellerSpriteNewReleaseMonths,
  type SellerSpriteCompetitorInput,
  type SellerSpriteKeywordMiningInput,
  type SellerSpriteKeywordReverseInput,
  type SellerSpriteMarketResearchInput,
  type SellerSpriteMarketResearchMonth,
  type SellerSpriteMonthlyInput,
  type SellerSpriteNewReleaseMonths,
} from '@cookie-amazon/protocol'

export type MarketResearchMonthOption = {
  value: SellerSpriteMarketResearchMonth
  label: string
}

export const getMarketResearchMonthOptions = (date = new Date()): readonly MarketResearchMonthOption[] =>
  getSellerSpriteMarketResearchMonths(date).map((value) => ({
    value,
    label: value === SELLERSPRITE_MARKET_RECENT_30_DAYS
      ? '最近 30 天'
      : `${value.slice(-6, -2)}-${value.slice(-2)}`,
  }))

export type ProductResearchQuery = {
  keyword: string
  market: string
  monthName: SellerSpriteMarketResearchMonth
  newReleaseNum: SellerSpriteNewReleaseMonths
  orderField: string
  page: number
  size: number
}

export type ProductResearchQueryError =
  | 'KEYWORD_REQUIRED'
  | 'KEYWORD_INVALID'
  | 'MARKET_RESEARCH_MONTH_INVALID'
  | 'NEW_RELEASE_MONTHS_INVALID'

export const DEFAULT_QUERY: ProductResearchQuery = {
  keyword: '',
  market: 'US',
  monthName: SELLERSPRITE_MARKET_RECENT_30_DAYS,
  newReleaseNum: 6,
  orderField: 'amz_unit',
  page: 1,
  size: 20,
}

const KEYWORD_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 &'/-]*$/

export const validateProductResearchQuery = (
  query: ProductResearchQuery,
): ProductResearchQueryError | null => {
  const keyword = query.keyword.trim()
  if (keyword.length === 0) return 'KEYWORD_REQUIRED'
  if (keyword.length > 80 || !KEYWORD_PATTERN.test(keyword)) return 'KEYWORD_INVALID'
  if (!isSellerSpriteMarketResearchMonth(query.monthName)) return 'MARKET_RESEARCH_MONTH_INVALID'
  if (!isSellerSpriteNewReleaseMonths(query.newReleaseNum)) return 'NEW_RELEASE_MONTHS_INVALID'
  return null
}

const SELLERSPRITE_KEYWORD_MARKETS: Readonly<Record<string, number>> = {
  US: 1,
}

export const buildKeywordReverseInput = (
  asin: string,
  market: string,
): SellerSpriteKeywordReverseInput => {
  const normalizedAsin = asin.trim().toUpperCase()
  if (!/^[A-Z0-9]{10}$/.test(normalizedAsin)) throw new Error('INVALID_ASIN')
  const keywordMarket = SELLERSPRITE_KEYWORD_MARKETS[market]
  if (!keywordMarket) throw new Error('UNSUPPORTED_KEYWORD_MARKET')
  return {
    asin: normalizedAsin,
    marketId: keywordMarket,
    month: '',
    forceReStat: false,
    badges: [],
    limit: 50,
  }
}

export const buildKeywordMiningInput = (
  keyword: string,
  market: string,
  page = 1,
  pageSize = 50,
): SellerSpriteKeywordMiningInput => {
  const normalizedKeyword = keyword.trim()
  const keywordMarket = SELLERSPRITE_KEYWORD_MARKETS[market]
  if (!keywordMarket) throw new Error('UNSUPPORTED_KEYWORD_MARKET')
  if (normalizedKeyword.length === 0 || normalizedKeyword.length > 80 || !KEYWORD_PATTERN.test(normalizedKeyword)) {
    throw new Error('INVALID_KEYWORD')
  }
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('INVALID_KEYWORD_PAGINATION')
  }
  return {
    keyword: normalizedKeyword,
    market: keywordMarket,
    pageNum: page,
    pageSize,
    historyDate: '',
    orderBy: 21,
    desc: true,
    filterRootWord: 0,
    matchType: 0,
    amazonChoice: false,
    keywordBidMatchType: 'exact',
  }
}

export const buildMonthlyInput = (
  asin: string,
  market: string,
): SellerSpriteMonthlyInput => {
  const normalizedAsin = asin.trim().toUpperCase()
  if (!/^[A-Z0-9]{10}$/.test(normalizedAsin)) throw new Error('INVALID_ASIN')
  if (market !== 'US') throw new Error('UNSUPPORTED_MONTHLY_MARKET')
  return { asin: normalizedAsin, month: '', station: 'US' }
}

export const buildMarketResearchInput = (
  keyword: string,
  market: string,
  monthName: SellerSpriteMarketResearchMonth,
  newReleaseNum: SellerSpriteNewReleaseMonths,
): SellerSpriteMarketResearchInput => {
  const normalizedKeyword = keyword.trim()
  if (market !== 'US') throw new Error('UNSUPPORTED_MARKET_RESEARCH_MARKET')
  if (normalizedKeyword.length === 0 || normalizedKeyword.length > 80 || !KEYWORD_PATTERN.test(normalizedKeyword)) {
    throw new Error('INVALID_KEYWORD')
  }
  if (!isSellerSpriteMarketResearchMonth(monthName)) throw new Error('INVALID_MARKET_RESEARCH_MONTH')
  if (!isSellerSpriteNewReleaseMonths(newReleaseNum)) throw new Error('INVALID_NEW_RELEASE_MONTHS')
  return { marketId: 1, departmentKeyword: normalizedKeyword, monthName, newReleaseNum }
}

export const buildCompetitorResearchInput = (
  query: ProductResearchQuery,
): SellerSpriteCompetitorInput => {
  const keyword = query.keyword.trim()
  if (validateProductResearchQuery(query) !== null) throw new Error('INVALID_KEYWORD')
  return {
    asins: [],
    keywords: keyword,
    brand: '',
    seller: '',
    lowPrice: 'N',
    market: query.market,
    monthName: query.monthName,
    nodeIdPaths: [],
    order: { desc: true, field: query.orderField },
    page: query.page,
    size: query.size,
    symbolFlag: false,
  }
}
