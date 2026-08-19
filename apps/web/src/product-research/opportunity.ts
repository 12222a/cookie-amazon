import type { ProductObservation } from '@cookie-amazon/analytics'

export type ProductSource = 'v3-api' | 'v2-dom' | 'demo'

export type OpportunityProduct = ProductObservation & {
  category: string
  monthlySales: number | null
  monthlyRevenue: number | null
  opportunity: number | null
  source: ProductSource
}

export type OpportunityReport = {
  total: number
  averageSales: number | null
  averageRevenue: number | null
  averagePrice: number | null
  medianOpportunity: number | null
  highPotential: number
  risks: readonly string[]
  distribution: readonly { label: string; count: number }[]
}

const CATEGORY_HINTS: readonly [RegExp, string][] = [
  [/charg|power|battery|cable/i, '电子配件'],
  [/kitchen|cook|bottle|mug|storage/i, '家居厨房'],
  [/toy|game|pet/i, '玩具宠物'],
  [/beauty|skin|hair|makeup/i, '美妆个护'],
  [/sport|fitness|yoga|outdoor/i, '运动户外'],
]

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const average = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export const inferCategory = (product: ProductObservation): string => {
  const text = `${product.title ?? ''} ${product.brand ?? ''}`
  return CATEGORY_HINTS.find(([pattern]) => pattern.test(text))?.[1] ?? '其他类目'
}

const scoreProduct = (product: ProductObservation): number | null => {
  if (product.estimatedSales === null && product.reviews === null && product.rating === null) return null
  const salesScore = product.estimatedSales === null ? 40 : clamp(Math.log10(product.estimatedSales + 1) * 18, 0, 65)
  const reviewScore = product.reviews === null ? 18 : clamp(24 - Math.log10(product.reviews + 1) * 6, 0, 24)
  const ratingScore = product.rating === null ? 8 : clamp(product.rating * 4, 0, 20)
  return Math.round(clamp(salesScore + reviewScore + ratingScore, 0, 99))
}

export const enrichProducts = (
  products: readonly ProductObservation[],
  source: ProductSource = 'v3-api',
): OpportunityProduct[] => products.map((product) => ({
  ...product,
  category: inferCategory(product),
  monthlySales: product.estimatedSales,
  monthlyRevenue: product.price !== null && product.estimatedSales !== null
    ? product.price * product.estimatedSales
    : null,
  opportunity: scoreProduct(product),
  source,
}))

export const buildOpportunityReport = (products: readonly OpportunityProduct[]): OpportunityReport => {
  const sales = products.flatMap((product) => product.monthlySales === null ? [] : [product.monthlySales])
  const revenue = products.flatMap((product) => product.monthlyRevenue === null ? [] : [product.monthlyRevenue])
  const prices = products.flatMap((product) => product.price === null ? [] : [product.price])
  const scores = products.flatMap((product) => product.opportunity === null ? [] : [product.opportunity])
  const highPotential = products.filter((product) => (product.opportunity ?? 0) >= 70).length
  const risks = [
    products.length === 0 ? '当前没有可分析的商品' : null,
    scores.length > 0 && (average(scores) ?? 0) < 55 ? '整体机会分偏低，建议扩大关键词或调整类目' : null,
    products.filter((product) => (product.reviews ?? 0) >= 1000).length > products.length / 2
      ? '头部商品评论壁垒较高' : null,
    products.filter((product) => product.price !== null && product.price < 15).length > products.length / 2
      ? '低客单商品占比高，需核算广告与履约成本' : null,
  ].filter((risk): risk is string => risk !== null)

  return {
    total: products.length,
    averageSales: average(sales),
    averageRevenue: average(revenue),
    averagePrice: average(prices),
    medianOpportunity: median(scores),
    highPotential,
    risks,
    distribution: [
      { label: '80+', count: products.filter((product) => (product.opportunity ?? 0) >= 80).length },
      { label: '60–79', count: products.filter((product) => (product.opportunity ?? 0) >= 60 && (product.opportunity ?? 0) < 80).length },
      { label: '<60', count: products.filter((product) => (product.opportunity ?? 0) < 60).length },
    ],
  }
}

const csvCell = (value: string | number | null): string => {
  const text = value === null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const opportunityProductsToCsv = (products: readonly OpportunityProduct[]): string => {
  const headers = ['ASIN', '标题', '类目', '价格', '月销量', '月销售额', '评分', '评论数', '机会分', '数据来源']
  const rows = products.map((product) => [
    product.asin,
    product.title,
    product.category,
    product.price,
    product.monthlySales,
    product.monthlyRevenue,
    product.rating,
    product.reviews,
    product.opportunity,
    product.source,
  ])
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}