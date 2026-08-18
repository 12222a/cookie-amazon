import type { ProductTrend, TrendDirection } from './index'

export type TrendSortKey =
  | 'asin'
  | 'title'
  | 'first'
  | 'last'
  | 'absoluteChange'
  | 'relativeChange'
  | 'sampleCount'

export type SortDirection = 'asc' | 'desc'

export type TrendFilterCriteria = {
  direction?: TrendDirection
  minSampleCount?: number
  query?: string
}

const compareValues = (a: string | number, b: string | number): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

export const sortTrends = (
  trends: readonly ProductTrend[],
  key: TrendSortKey,
  direction: SortDirection,
): ProductTrend[] => {
  const factor = direction === 'asc' ? 1 : -1
  return trends
    .map((trend, index) => ({ trend, index }))
    .sort((a, b) => {
      const av = a.trend[key]
      const bv = b.trend[key]
      if (av === null && bv === null) return a.index - b.index
      if (av === null) return 1
      if (bv === null) return -1
      const cmp = compareValues(av, bv)
      return cmp !== 0 ? cmp * factor : a.index - b.index
    })
    .map((entry) => entry.trend)
}

export const filterTrends = (
  trends: readonly ProductTrend[],
  criteria: TrendFilterCriteria,
): ProductTrend[] => {
  const query = criteria.query?.trim().toLowerCase()
  return trends.filter((trend) => {
    if (criteria.direction !== undefined && trend.direction !== criteria.direction) return false
    if (criteria.minSampleCount !== undefined && trend.sampleCount < criteria.minSampleCount) {
      return false
    }
    if (query) {
      const haystack = `${trend.asin} ${trend.title ?? ''}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}