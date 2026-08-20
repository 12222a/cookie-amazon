import type { ProductObservation } from '@cookie-amazon/analytics'
import type { KeywordMarketReport } from './keyword-market'

export type ProductSource = 'v3-api' | 'v2-dom' | 'demo'
export type MarketRecommendation = 'GOOD_OPPORTUNITY' | 'WATCH' | 'DIFFICULT' | 'INSUFFICIENT_DATA'

export type OpportunityProduct = ProductObservation & {
  category: string
  monthlySales: number | null
  monthlyRevenue: number | null
  researchPriority: number | null
  source: ProductSource
}

export type MarketMetrics = {
  productCount: number
  dataCompleteness: number
  totalEstimatedSales: number | null
  medianEstimatedSales: number | null
  medianPrice: number | null
  medianReviews: number | null
  medianRating: number | null
  top3SalesShare: number | null
  top10SalesShare: number | null
  brandCount: number
  brandConcentration: number | null
  listingAgeCoverage: number
  medianListingAgeDays: number | null
  newListingShare: number | null
}

export type OpportunityReport = {
  total: number
  averageSales: number | null
  averageRevenue: number | null
  averagePrice: number | null
  medianResearchPriority: number | null
  highPriority: number
  demandScore: number | null
  entryScore: number | null
  marketScore: number | null
  marketConfidence: number
  recommendation: MarketRecommendation
  marketMetrics: MarketMetrics
  keywordReport: KeywordMarketReport | null
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

const defined = (values: readonly (number | null)[]): number[] =>
  values.flatMap((value) => value === null ? [] : [value])

const percentile = (values: readonly number[], ratio: number): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * ratio
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

const scale = (value: number, low: number, high: number): number =>
  low === high ? 50 : clamp(((value - low) / (high - low)) * 100, 0, 100)

const logScale = (value: number, low: number, high: number): number =>
  scale(Math.log10(value + 1), Math.log10(low + 1), Math.log10(high + 1))

const weightedAverage = (components: readonly { value: number | null; weight: number }[]): number | null => {
  const available = components.filter((component) => component.value !== null)
  if (available.length === 0) return null
  const weight = available.reduce((sum, component) => sum + component.weight, 0)
  return Math.round(available.reduce((sum, component) => sum + component.value! * component.weight, 0) / weight)
}

export const inferCategory = (product: ProductObservation): string => {
  const text = `${product.title ?? ''} ${product.brand ?? ''}`
  return CATEGORY_HINTS.find(([pattern]) => pattern.test(text))?.[1] ?? '其他类目'
}

const researchPriorityOf = (
  product: ProductObservation,
  products: readonly ProductObservation[],
): number | null => {
  const sales = defined(products.map((item) => item.estimatedSales))
  const reviews = defined(products.map((item) => item.reviews))
  const salesLow = percentile(sales, 0.1)
  const salesHigh = percentile(sales, 0.9)
  const reviewsLow = percentile(reviews, 0.1)
  const reviewsHigh = percentile(reviews, 0.9)
  const components = [
    {
      value: product.estimatedSales === null || salesLow === null || salesHigh === null
        ? null : logScale(product.estimatedSales, salesLow, salesHigh),
      weight: 0.45,
    },
    {
      value: product.reviews === null || reviewsLow === null || reviewsHigh === null
        ? null : 100 - logScale(product.reviews, reviewsLow, reviewsHigh),
      weight: 0.35,
    },
    {
      value: product.rating === null ? null : scale(product.rating, 3.5, 4.8),
      weight: 0.2,
    },
  ]
  return weightedAverage(components)
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
  researchPriority: researchPriorityOf(product, products),
  source,
}))

const brandConcentrationOf = (products: readonly OpportunityProduct[], totalSales: number): number | null => {
  if (totalSales <= 0) return null
  const salesByBrand = new Map<string, number>()
  for (const product of products) {
    const sales = product.monthlySales ?? 0
    const brand = product.brand?.trim() || '未标注品牌'
    salesByBrand.set(brand, (salesByBrand.get(brand) ?? 0) + sales)
  }
  return [...salesByBrand.values()].reduce((sum, sales) => sum + (sales / totalSales) ** 2, 0)
}

const buildMarketMetrics = (products: readonly OpportunityProduct[]): MarketMetrics => {
  const sales = defined(products.map((product) => product.monthlySales))
  const prices = defined(products.map((product) => product.price))
  const reviews = defined(products.map((product) => product.reviews))
  const ratings = defined(products.map((product) => product.rating))
  const listingAges = defined(products.map((product) => product.availableDays ?? null))
  const totalEstimatedSales = sales.length === 0 ? null : sales.reduce((sum, value) => sum + value, 0)
  const expectedValues = products.length * 4
  const observedValues = products.reduce((sum, product) => sum + [product.price, product.rating, product.reviews, product.monthlySales]
    .filter((value) => value !== null).length, 0)
  const sortedSales = [...products].sort((a, b) => (b.monthlySales ?? 0) - (a.monthlySales ?? 0))
  const share = (count: number): number | null => totalEstimatedSales === null || totalEstimatedSales === 0
    ? null
    : sortedSales.slice(0, count).reduce((sum, product) => sum + (product.monthlySales ?? 0), 0) / totalEstimatedSales
  return {
    productCount: products.length,
    dataCompleteness: expectedValues === 0 ? 0 : observedValues / expectedValues,
    totalEstimatedSales,
    medianEstimatedSales: median(sales),
    medianPrice: median(prices),
    medianReviews: median(reviews),
    medianRating: median(ratings),
    top3SalesShare: share(3),
    top10SalesShare: share(10),
    brandCount: new Set(products.map((product) => product.brand?.trim() || '未标注品牌')).size,
    brandConcentration: totalEstimatedSales === null || totalEstimatedSales === 0
      ? null : brandConcentrationOf(products, totalEstimatedSales),
    listingAgeCoverage: products.length === 0 ? 0 : listingAges.length / products.length,
    medianListingAgeDays: median(listingAges),
    newListingShare: listingAges.length === 0
      ? null : listingAges.filter((days) => days <= 365).length / listingAges.length,
  }
}

const buildMarketScore = (
  metrics: MarketMetrics,
  keywordReport: KeywordMarketReport | null,
): { demandScore: number | null; entryScore: number | null; score: number | null; confidence: number } => {
  const productDemand = metrics.totalEstimatedSales === null || metrics.medianEstimatedSales === null
    ? null
    : (logScale(metrics.totalEstimatedSales, 1_000, 500_000) * 0.6
      + logScale(metrics.medianEstimatedSales, 50, 10_000) * 0.4)
  const demandScore = keywordReport?.demandScore ?? productDemand
  const reviewBarrier = metrics.medianReviews === null
    ? null : 100 - logScale(metrics.medianReviews, 100, 20_000)
  const salesConcentration = metrics.top3SalesShare === null
    ? null : 100 - scale(metrics.top3SalesShare, 0.2, 0.8)
  const listingAccessibility = metrics.newListingShare === null
    ? null : scale(metrics.newListingShare, 0.05, 0.45)
  const keywordCompetition = keywordReport?.medianSupplyDemandRatio === null
    || keywordReport?.medianSupplyDemandRatio === undefined
    ? null : 100 - logScale(keywordReport.medianSupplyDemandRatio, 0.5, 200)
  const entryScore = weightedAverage([
    { value: reviewBarrier, weight: 0.35 },
    { value: salesConcentration, weight: 0.25 },
    { value: listingAccessibility, weight: 0.2 },
    { value: keywordCompetition, weight: 0.2 },
  ])
  const score = weightedAverage([
    { value: demandScore, weight: 0.55 },
    { value: entryScore, weight: 0.45 },
  ])
  const productCoverage = metrics.dataCompleteness * 0.35
  const keywordCoverage = keywordReport === null ? 0 : keywordReport.demandConfidence * 0.3
  const listingCoverage = metrics.listingAgeCoverage * 0.1
  const sampleCoverage = metrics.productCount > 0 ? 0.1 : 0
  return {
    demandScore,
    entryScore,
    score,
    confidence: Math.round((productCoverage + keywordCoverage + listingCoverage + sampleCoverage) * 100) / 100,
  }
}

const recommendationOf = (score: number | null, confidence: number): MarketRecommendation => {
  if (score === null || confidence < 0.9) return 'INSUFFICIENT_DATA'
  if (score >= 70) return 'GOOD_OPPORTUNITY'
  if (score >= 50) return 'WATCH'
  return 'DIFFICULT'
}

export const buildOpportunityReport = (
  products: readonly OpportunityProduct[],
  keywordReport: KeywordMarketReport | null = null,
): OpportunityReport => {
  const sales = defined(products.map((product) => product.monthlySales))
  const revenue = defined(products.map((product) => product.monthlyRevenue))
  const prices = defined(products.map((product) => product.price))
  const priorities = defined(products.map((product) => product.researchPriority))
  const marketMetrics = buildMarketMetrics(products)
  const {
    demandScore,
    entryScore,
    score: marketScore,
    confidence: marketConfidence,
  } = buildMarketScore(marketMetrics, keywordReport)
  const highPriority = products.filter((product) => (product.researchPriority ?? 0) >= 70).length
  const risks = [
    products.length === 0 ? '当前没有可分析的商品' : null,
    marketMetrics.top3SalesShare !== null && marketMetrics.top3SalesShare >= 0.6
      ? '销量高度集中在少数头部商品，新品进入难度可能较高' : null,
    marketMetrics.medianReviews !== null && marketMetrics.medianReviews >= 1_000
      ? '市场评论中位数较高，存在明显评论壁垒' : null,
    marketMetrics.medianPrice !== null && marketMetrics.medianPrice < 15
      ? '市场中位价格偏低，需单独核算广告与履约成本' : null,
    marketMetrics.dataCompleteness < 0.5
      ? '当前数据不完整，搜索趋势、新品和评论痛点尚未纳入' : null,
    keywordReport === null ? 'ASIN 反查关键词尚未获得有效结果，Demand Score 仍依赖商品销量信号' : null,
    marketMetrics.listingAgeCoverage < 0.5 ? 'Listing Age 覆盖不足，尚不能判断新品进入表现' : null,
    'Review 文本痛点和结构化产品属性尚未接入，不参与评分',
    marketConfidence < 0.9 ? '当前仍是初步市场分析，数据覆盖不足以形成完整进入结论' : null,
  ].filter((risk): risk is string => risk !== null)
  return {
    total: products.length,
    averageSales: average(sales),
    averageRevenue: average(revenue),
    averagePrice: average(prices),
    medianResearchPriority: median(priorities),
    highPriority,
    demandScore,
    entryScore,
    marketScore,
    marketConfidence,
    recommendation: recommendationOf(marketScore, marketConfidence),
    marketMetrics,
    keywordReport,
    risks,
    distribution: [
      { label: '70+', count: products.filter((product) => (product.researchPriority ?? 0) >= 70).length },
      { label: '50–69', count: products.filter((product) => (product.researchPriority ?? 0) >= 50 && (product.researchPriority ?? 0) < 70).length },
      { label: '<50', count: products.filter((product) => (product.researchPriority ?? 0) < 50).length },
    ],
  }
}

const csvCell = (value: string | number | null): string => {
  const text = value === null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const opportunityProductsToCsv = (products: readonly OpportunityProduct[]): string => {
  const headers = ['ASIN', '标题', '类目', '价格', '月销量', '月销售额', '评分', '评论数', '研究优先级', '数据来源']
  const rows = products.map((product) => [
    product.asin,
    product.title,
    product.category,
    product.price,
    product.monthlySales,
    product.monthlyRevenue,
    product.rating,
    product.reviews,
    product.researchPriority,
    product.source,
  ])
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}