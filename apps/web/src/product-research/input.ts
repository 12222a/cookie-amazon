import type { SellerSpriteProductSelectionInput } from '@cookie-amazon/protocol'

export type ProductResearchQuery = {
  market: string
  monthName: string
  orderField: string
  page: number
  size: number
}

export const DEFAULT_QUERY: ProductResearchQuery = {
  market: 'US',
  monthName: '',
  orderField: 'month_revenue',
  page: 1,
  size: 20,
}

export const buildProductSelectionInput = (
  query: ProductResearchQuery,
): SellerSpriteProductSelectionInput => ({
  eligibility: [],
  filterSub: false,
  lowPrice: '',
  market: query.market,
  monthName: query.monthName,
  nodeIdPaths: [],
  order: { desc: true, field: query.orderField },
  page: query.page,
  pkgDimensionTypeList: [],
  productTags: [],
  selectType: 'default',
  sellerNationList: [],
  sellerTypes: [],
  size: query.size,
  symbolFlag: false,
  weightUnit: 'lb',
})