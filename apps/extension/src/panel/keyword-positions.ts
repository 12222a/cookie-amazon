/**
 * 词位情报的展示层：把反查响应翻译成面板要渲染的行。
 *
 * 只翻译，不判断——这里不产出任何分数或建议。位置数据只用于展示（ADR-0002）。
 * 缺什么显示未知，不用 0 或空串顶替，也不省略该列，否则用户分不清「没有」和「没读到」。
 */
import type { SellerSpriteKeywordReverseData } from '@cookie-amazon/protocol'
type KeywordItem = SellerSpriteKeywordReverseData['items'][number]
type Position = { page: number | null; rank: number | null }
const UNKNOWN = '—'
/** 平台给的来源类型码。未知码原样透出，不猜含义。 */
export const POSITION_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  NT: '自然搜索词',
  SPONSOR_BRAND: '品牌广告词',
  SPONSOR_VIDEO: '视频广告词',
  ADS: 'SP广告词',
  AMAZON_CHOICE: 'AC推荐词',
})
export type KeywordPositionSourceCount = {
  code: string
  label: string
  count: number
}
export type KeywordPositionSummary = {
  totalKeywords: number
  rankedKeywords: number
  adKeywords: number
  sourceTypeCounts: KeywordPositionSourceCount[]
}
export type KeywordTrendPoint = {
  month: string
  searches: number
  index: number
}
export type KeywordTrendView =
  | {
      kind: 'line'
      pointCount: number
      sampleCount: number
      segments: KeywordTrendPoint[][]
    }
  | { kind: 'insufficient'; sampleCount: number }
  | { kind: 'unavailable' }
export type KeywordPositionRow = {
  keyword: string
  natural: string
  ad: string
  naturalShare: string
  adShare: string
  types: string
  trend: KeywordTrendView
}
/**
 * 名次展示规则：第一页只写名次，翻页之后必须带页号——
 * 「107」和「第 2 页 · 107」对选品的含义完全不同，只写数字会误导。
 *
 * 只有页号、没有名次时显示未知：「出现在第 2 页」读起来像一次展示，
 * 而我们并不知道它排在第几位。
 */
const hasRank = (position: Position | null): position is Position & { rank: number } =>
  position !== null && position.rank !== null

const formatPosition = (position: Position | null): string => {
  if (!hasRank(position)) return UNKNOWN
  const onFirstPage = position.page === null || position.page <= 1
  return onFirstPage ? String(position.rank) : `第 ${position.page} 页 · ${position.rank}`
}
/**
 * 占比上游给分数（0.76）；但不排除它某天改成百分数，
 * 而 76 乘 100 会变成 7600%。所以只在 <=1 时当分数换算，超出就按已是百分数处理。
 */
const formatShare = (value: number | null): string => {
  if (value === null || !Number.isFinite(value) || value < 0) return UNKNOWN
  const percent = value <= 1 ? value * 100 : value
  return `${Math.round(percent)}%`
}
const formatTypes = (types: string[] | null): string => {
  if (types === null || types.length === 0) return UNKNOWN
  return types.map((type) => POSITION_TYPE_LABELS[type] ?? type).join('、')
}

const TREND_WINDOW_MONTHS = 12

const monthIndex = (value: string): number | null => {
  const match = /^(\d{4})[-/.]?(\d{1,2})$/.exec(value.trim())
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return year * 12 + month - 1
}

const canConnectTrendPoints = (previous: KeywordTrendPoint, next: KeywordTrendPoint): boolean => {
  // index 是规范化后的月份偏移；缺月会留下间隔，不会被误画成连续趋势。
  return next.index - previous.index === 1
}

export const describeKeywordTrend = (
  trend: KeywordItem['searchesTrend'],
): KeywordTrendView => {
  if (trend === null || trend.length === 0) return { kind: 'unavailable' }

  // 卖家精灵通常返回近 12 个月，但展示层不能把这个行为当契约：
  // 先过滤非法月份与无效搜索量，再按月份排序，并以最新有效月份为窗口终点。
  // 同一月份只保留最后一条，避免重复记录被误算成多个样本。
  const byMonth = new Map<number, { month: string; searches: number; inputIndex: number }>()
  for (const [inputIndex, point] of trend.entries()) {
    const parsedMonth = monthIndex(point.month)
    if (parsedMonth === null || point.searches === null || !Number.isFinite(point.searches) || point.searches < 0) continue
    byMonth.set(parsedMonth, { month: point.month.trim(), searches: point.searches, inputIndex })
  }
  const sorted = [...byMonth.entries()]
    .sort(([leftMonth, left], [rightMonth, right]) => leftMonth - rightMonth || left.inputIndex - right.inputIndex)
  if (sorted.length === 0) return { kind: 'insufficient', sampleCount: 0 }

  const latestMonth = sorted[sorted.length - 1]![0]
  const firstMonthInWindow = latestMonth - TREND_WINDOW_MONTHS + 1
  const recent = sorted.filter(([month]) => month >= firstMonthInWindow)
  const firstMonth = recent[0]![0]
  const points: KeywordTrendPoint[] = recent.map(([month, point]) => ({
    month: point.month,
    searches: point.searches,
    index: month - firstMonth,
  }))
  if (points.length < 6) return { kind: 'insufficient', sampleCount: points.length }

  const segments: KeywordTrendPoint[][] = []
  let current: KeywordTrendPoint[] = []
  let previous: KeywordTrendPoint | null = null
  for (const next of points) {
    if (previous !== null && !canConnectTrendPoints(previous, next)) {
      if (current.length > 0) segments.push(current)
      current = []
    }
    current.push(next)
    previous = next
  }
  if (current.length > 0) segments.push(current)

  return {
    kind: 'line',
    pointCount: points[points.length - 1]!.index + 1,
    sampleCount: points.length,
    segments,
  }
}

const toRow = (item: KeywordItem): KeywordPositionRow => ({
  keyword: item.keywords,
  natural: formatPosition(item.natural),
  ad: formatPosition(item.ad),
  naturalShare: formatShare(item.naturalRatio),
  adShare: formatShare(item.adRatio),
  types: formatTypes(item.positionTypes),
  trend: describeKeywordTrend(item.searchesTrend),
})
export const describeKeywordPositions = (data: SellerSpriteKeywordReverseData): KeywordPositionRow[] =>
  data.items.map(toRow)

export const describeKeywordPositionSummary = (data: SellerSpriteKeywordReverseData): KeywordPositionSummary => {
  let rankedKeywords = 0
  let adKeywords = 0
  const sourceTypeCounts = new Map<string, KeywordPositionSourceCount>()

  for (const item of data.items) {
    if (hasRank(item.natural)) rankedKeywords += 1
    if (hasRank(item.ad)) adKeywords += 1

    for (const code of new Set(item.positionTypes ?? [])) {
      const current = sourceTypeCounts.get(code)
      if (current === undefined) {
        sourceTypeCounts.set(code, {
          code,
          label: POSITION_TYPE_LABELS[code] ?? code,
          count: 1,
        })
      } else {
        current.count += 1
      }
    }
  }

  return {
    totalKeywords: data.items.length,
    rankedKeywords,
    adKeywords,
    sourceTypeCounts: [...sourceTypeCounts.values()],
  }
}
