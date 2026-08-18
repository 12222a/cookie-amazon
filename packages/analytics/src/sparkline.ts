import type { ProductSeries, TrendMetric } from './index'

export type Sparkline = {
  points: string
  width: number
  height: number
  hasData: boolean
}

export type SparklineOptions = {
  width?: number
  height?: number
}

const DEFAULT_WIDTH = 120
const DEFAULT_HEIGHT = 32

const round2 = (value: number): number => Math.round(value * 100) / 100

export const toSparkline = (
  series: ProductSeries,
  metric: TrendMetric,
  options: SparklineOptions = {},
): Sparkline => {
  const width = options.width ?? DEFAULT_WIDTH
  const height = options.height ?? DEFAULT_HEIGHT
  const values = series.points
    .map((point) => point.observation[metric])
    .filter((value): value is number => value !== null)

  if (values.length < 2) {
    return { points: '', width, height, hasData: false }
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const stepX = width / (values.length - 1)

  const points = values
    .map((value, index) => {
      const x = round2(index * stepX)
      const y = span === 0 ? round2(height / 2) : round2(height - ((value - min) / span) * height)
      return `${x},${y}`
    })
    .join(' ')

  return { points, width, height, hasData: true }
}