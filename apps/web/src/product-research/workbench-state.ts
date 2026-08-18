import {
  filterTrends,
  sortTrends,
  type ProductTrend,
  type SortDirection,
  type TrendDirection,
  type TrendFilterCriteria,
  type TrendSortKey,
} from '@cookie-amazon/analytics'

export type SortState = {
  key: TrendSortKey
  direction: SortDirection
}

export type FilterInput = {
  direction: TrendDirection | 'all'
  minSampleCount: string
  query: string
}

export const DEFAULT_SORT: SortState = { key: 'last', direction: 'desc' }

export const DEFAULT_FILTER: FilterInput = {
  direction: 'all',
  minSampleCount: '',
  query: '',
}

export const toggleSort = (current: SortState, key: TrendSortKey): SortState => {
  if (current.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { key, direction: 'asc' }
}

export const toggleSelection = (selected: readonly string[], asin: string): string[] =>
  selected.includes(asin) ? selected.filter((value) => value !== asin) : [...selected, asin]

export const toCriteria = (input: FilterInput): TrendFilterCriteria => {
  const criteria: TrendFilterCriteria = {}
  if (input.direction !== 'all') criteria.direction = input.direction
  const min = Number.parseInt(input.minSampleCount, 10)
  if (Number.isFinite(min) && min > 0) criteria.minSampleCount = min
  const query = input.query.trim()
  if (query.length > 0) criteria.query = query
  return criteria
}

export const applyView = (
  trends: readonly ProductTrend[],
  sort: SortState,
  input: FilterInput,
): ProductTrend[] => sortTrends(filterTrends(trends, toCriteria(input)), sort.key, sort.direction)

export const ariaSort = (sort: SortState, key: TrendSortKey): 'ascending' | 'descending' | 'none' => {
  if (sort.key !== key) return 'none'
  return sort.direction === 'asc' ? 'ascending' : 'descending'
}