import type { SellerSpriteCompetitorInput } from '@cookie-amazon/protocol'

export type ProductResearchQuery = {
  keyword: string
  market: string
  monthName: string
  orderField: string
  page: number
  size: number
}

export type ProductResearchQueryError = 'KEYWORD_REQUIRED' | 'KEYWORD_INVALID'

export const DEFAULT_QUERY: ProductResearchQuery = {
  keyword: '',
  market: 'US',
  monthName: 'bsr_sales_nearly',
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
  return null
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
