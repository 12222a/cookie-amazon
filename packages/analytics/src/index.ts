import type { SellerSpriteProductSelectionData } from '@cookie-amazon/protocol'

export type ProductObservation = {
  asin: string
  title: string | null
  brand: string | null
  imageUrl: string | null
  price: number | null
  rating: number | null
  reviews: number | null
  estimatedSales: number | null
}

export type ProductSnapshot = {
  snapshotId: string
  capturedAt: number
  market: string
  selectType: string
  page: number
  total: number
  observations: ProductObservation[]
}

export type SnapshotMeta = {
  snapshotId: string
  capturedAt: number
  market: string
  selectType: string
}

export type ProductSeriesPoint = {
  capturedAt: number
  observation: ProductObservation
}

export type ProductSeries = {
  asin: string
  points: ProductSeriesPoint[]
}

export type TrendMetric = 'price' | 'rating' | 'reviews' | 'estimatedSales'

export type TrendDirection = 'up' | 'down' | 'flat' | 'unknown'

export type ProductTrend = {
  asin: string
  title: string | null
  metric: TrendMetric
  first: number | null
  last: number | null
  absoluteChange: number | null
  relativeChange: number | null
  direction: TrendDirection
  sampleCount: number
}

const toObservation = (
  item: SellerSpriteProductSelectionData['items'][number],
): ProductObservation => ({
  asin: item.asin,
  title: item.title,
  brand: item.brand,
  imageUrl: item.imageUrl,
  price: item.price,
  rating: item.rating,
  reviews: item.reviews,
  estimatedSales: item.estimatedSales,
})

export const toSnapshot = (
  data: SellerSpriteProductSelectionData,
  meta: SnapshotMeta,
): ProductSnapshot => ({
  snapshotId: meta.snapshotId,
  capturedAt: meta.capturedAt,
  market: meta.market,
  selectType: meta.selectType,
  page: data.page,
  total: data.total,
  observations: data.items.map(toObservation),
})

export const buildSeries = (
  snapshots: readonly ProductSnapshot[],
): ProductSeries[] => {
  const byAsin = new Map<string, ProductSeriesPoint[]>()
  const ordered = [...snapshots].sort((a, b) => a.capturedAt - b.capturedAt)
  for (const snapshot of ordered) {
    for (const observation of snapshot.observations) {
      const points = byAsin.get(observation.asin) ?? []
      points.push({ capturedAt: snapshot.capturedAt, observation })
      byAsin.set(observation.asin, points)
    }
  }
  return [...byAsin.entries()].map(([asin, points]) => ({ asin, points }))
}

const directionOf = (change: number | null): TrendDirection => {
  if (change === null) return 'unknown'
  if (change > 0) return 'up'
  if (change < 0) return 'down'
  return 'flat'
}

export const computeTrend = (
  series: ProductSeries,
  metric: TrendMetric,
): ProductTrend => {
  const defined = series.points.filter((point) => point.observation[metric] !== null)
  const first = defined.at(0)?.observation[metric] ?? null
  const last = defined.at(-1)?.observation[metric] ?? null
  const title = series.points.at(-1)?.observation.title ?? null
  const absoluteChange = first !== null && last !== null ? last - first : null
  const relativeChange =
    absoluteChange !== null && first !== null && first !== 0 ? absoluteChange / first : null
  return {
    asin: series.asin,
    title,
    metric,
    first,
    last,
    absoluteChange,
    relativeChange,
    direction: directionOf(absoluteChange),
    sampleCount: defined.length,
  }
}

export const computeTrends = (
  seriesList: readonly ProductSeries[],
  metric: TrendMetric,
): ProductTrend[] => seriesList.map((series) => computeTrend(series, metric))

export {
  sortTrends,
  filterTrends,
  type TrendSortKey,
  type SortDirection,
  type TrendFilterCriteria,
} from './trends'
export { toSparkline, type Sparkline, type SparklineOptions } from './sparkline'
export { trendsToCsv, seriesToCsv } from './csv'