import { useCallback, useEffect, useState } from 'react'
import {
  buildSeries,
  computeTrends,
  toSnapshot,
  type ProductSeries,
  type ProductSnapshot,
  type ProductTrend,
  type TrendMetric,
} from '@cookie-amazon/analytics'
import { selectSellerSpriteProducts, WebSdkError } from '@cookie-amazon/web-sdk'
import { listSnapshots, putSnapshot } from '../store/snapshots'
import { buildProductSelectionInput, type ProductResearchQuery } from './input'

const createSnapshotId = (): string =>
  `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export type ProductResearchState = {
  snapshots: readonly ProductSnapshot[]
  series: readonly ProductSeries[]
  trends: readonly ProductTrend[]
  refreshing: boolean
  loading: boolean
  error: string | null
}

export const useProductResearch = (
  targetId: string,
  metric: TrendMetric,
): ProductResearchState & {
  refresh: (query: ProductResearchQuery) => Promise<void>
} => {
  const [snapshots, setSnapshots] = useState<readonly ProductSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const stored = await listSnapshots()
        if (active) setSnapshots(stored)
      } catch {
        if (active) setError('HISTORY_LOAD_FAILED')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const refresh = useCallback(
    async (query: ProductResearchQuery): Promise<void> => {
      setRefreshing(true)
      setError(null)
      try {
        const data = await selectSellerSpriteProducts(buildProductSelectionInput(query), {
          timeoutMs: 15_000,
        })
        const snapshot = toSnapshot(data, {
          snapshotId: createSnapshotId(),
          capturedAt: Date.now(),
          market: query.market,
          selectType: 'default',
        })
        await putSnapshot(snapshot)
        setSnapshots(await listSnapshots())
      } catch (reason: unknown) {
        setError(reason instanceof WebSdkError ? reason.code : 'REFRESH_FAILED')
      } finally {
        setRefreshing(false)
      }
    },
    [targetId],
  )

  const series = buildSeries(snapshots)
  const trends = computeTrends(series, metric)

  return { snapshots, series, trends, refreshing, loading, error, refresh }
}