import type { ProductSeries, ProductTrend, TrendMetric } from './index'

const escapeField = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

const cell = (value: string | number | null): string => {
  if (value === null) return ''
  return escapeField(typeof value === 'number' ? String(value) : value)
}

const toRow = (fields: readonly (string | number | null)[]): string =>
  fields.map(cell).join(',')

const TREND_HEADER = [
  'asin',
  'title',
  'metric',
  'first',
  'last',
  'absoluteChange',
  'relativeChange',
  'direction',
  'sampleCount',
] as const

export const trendsToCsv = (trends: readonly ProductTrend[]): string => {
  const rows = [toRow(TREND_HEADER)]
  for (const trend of trends) {
    rows.push(
      toRow([
        trend.asin,
        trend.title,
        trend.metric,
        trend.first,
        trend.last,
        trend.absoluteChange,
        trend.relativeChange,
        trend.direction,
        trend.sampleCount,
      ]),
    )
  }
  return rows.join('\r\n')
}

const SERIES_HEADER = ['asin', 'title', 'capturedAt', 'value'] as const

export const seriesToCsv = (
  seriesList: readonly ProductSeries[],
  metric: TrendMetric,
): string => {
  const rows = [toRow(SERIES_HEADER)]
  for (const series of seriesList) {
    for (const point of series.points) {
      rows.push(
        toRow([
          series.asin,
          point.observation.title,
          point.capturedAt,
          point.observation[metric],
        ]),
      )
    }
  }
  return rows.join('\r\n')
}