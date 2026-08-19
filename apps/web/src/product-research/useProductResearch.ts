import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildSeries,
  computeTrends,
  toSnapshot,
  type ProductObservation,
  type ProductSeries,
  type ProductSnapshot,
  type ProductTrend,
  type TrendMetric,
} from '@cookie-amazon/analytics'
import { researchSellerSpriteCompetitors, WebSdkError } from '@cookie-amazon/web-sdk'
import { listSnapshots, putSnapshot } from '../store/snapshots'
import {
  buildCompetitorResearchInput,
  validateProductResearchQuery,
  type ProductResearchQuery,
} from './input'
import { enrichProducts, type OpportunityProduct, type ProductSource } from './opportunity'

const createSnapshotId = (): string =>
  `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const DEMO_PRODUCTS: readonly ProductObservation[] = [
  { asin: 'B0C7WIRE01', title: 'Wireless Charging Station, 3 in 1 Fast Charger Stand', brand: 'Northstar', imageUrl: null, price: 39.99, rating: 4.7, reviews: 842, estimatedSales: 2180 },
  { asin: 'B0B8POWER02', title: 'Portable Power Bank 10000mAh with USB-C Cable', brand: 'Voltmark', imageUrl: null, price: 24.99, rating: 4.5, reviews: 1260, estimatedSales: 3460 },
  { asin: 'B0D2DESK03', title: 'Adjustable Aluminum Laptop Stand for Desk', brand: 'Formline', imageUrl: null, price: 32.5, rating: 4.6, reviews: 316, estimatedSales: 1290 },
  { asin: 'B0A9CABLE04', title: 'Braided USB C Cable 6ft, 2 Pack', brand: 'Loop&Co', imageUrl: null, price: 15.99, rating: 4.4, reviews: 2190, estimatedSales: 5120 },
  { asin: 'B0E1TRAVEL05', title: 'Travel Organizer Tech Pouch with Cable Storage', brand: 'Carrywell', imageUrl: null, price: 27.99, rating: 4.8, reviews: 188, estimatedSales: 970 },
  { asin: 'B0F3MAGNET06', title: 'Magnetic Car Phone Mount, Dashboard Holder', brand: 'Gripcraft', imageUrl: null, price: 21.99, rating: 4.2, reviews: 1740, estimatedSales: 2840 },
]

const demoSnapshot = (market: string, keyword: string): ProductSnapshot => ({
  snapshotId: `demo-${market}-${keyword || 'seed'}`,
  capturedAt: Date.now(),
  market,
  selectType: 'demo',
  page: 1,
  total: DEMO_PRODUCTS.length,
  observations: [...DEMO_PRODUCTS],
})

export type ProductResearchState = {
  snapshots: readonly ProductSnapshot[]
  products: readonly ProductObservation[]
  opportunityProducts: readonly OpportunityProduct[]
  series: readonly ProductSeries[]
  trends: readonly ProductTrend[]
  refreshing: boolean
  loading: boolean
  error: string | null
  source: ProductSource | 'demo'
}

export const useProductResearch = (
  targetId: string,
  metric: TrendMetric,
  targetReady = false,
): ProductResearchState & {
  refresh: (query: ProductResearchQuery) => Promise<void>
} => {
  const [snapshots, setSnapshots] = useState<readonly ProductSnapshot[]>([])
  const [products, setProducts] = useState<readonly ProductObservation[]>(DEMO_PRODUCTS)
  const [source, setSource] = useState<ProductSource | 'demo'>('demo')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const stored = await listSnapshots()
        if (active && stored.length > 0) {
          setSnapshots(stored)
          const latest = [...stored].sort((a, b) => b.capturedAt - a.capturedAt)[0]
          setProducts(latest?.observations ?? DEMO_PRODUCTS)
          setSource(latest?.selectType === 'demo' ? 'demo' : 'v3-api')
        }
      } catch {
        if (active) setError('HISTORY_LOAD_FAILED')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const refresh = useCallback(async (query: ProductResearchQuery): Promise<void> => {
    const queryError = validateProductResearchQuery(query)
    if (queryError !== null) {
      setError(queryError)
      return
    }
    setRefreshing(true)
    setError(null)
    try {
      if (!targetReady) {
        setError('TARGET_NOT_READY')
        return
      }
      const input = buildCompetitorResearchInput(query)
      const data = await researchSellerSpriteCompetitors(input, { timeoutMs: 15_000 })
      const snapshot = toSnapshot(data, {
        snapshotId: createSnapshotId(),
        capturedAt: Date.now(),
        market: query.market,
        selectType: 'v3-api',
      })
      await putSnapshot(snapshot)
      const stored = await listSnapshots()
      setSnapshots(stored)
      setProducts(snapshot.observations)
      setSource('v3-api')
    } catch (reason: unknown) {
      setError(reason instanceof WebSdkError ? reason.code : 'REFRESH_FAILED')
    } finally {
      setRefreshing(false)
    }
  }, [targetReady])

  const series = useMemo(() => buildSeries(snapshots), [snapshots])
  const trends = useMemo(() => computeTrends(series, metric), [series, metric])
  const opportunityProducts = useMemo(() => enrichProducts(products, source), [products, source])

  return { snapshots, products, opportunityProducts, series, trends, refreshing, loading, error, source, refresh }
}

export { DEMO_PRODUCTS }