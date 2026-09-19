import type { KeywordTrendPoint, KeywordTrendView } from './keyword-positions'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * 侧边栏与页面浮层共用的趋势渲染器。
 *
 * 趋势本身已经在 keyword-positions.ts 中完成清洗；这里仅把固定的
 * KeywordTrendView 画成内联 SVG，不在 UI 层重新解释月份或样本。
 */
export const renderKeywordTrend = (
  document: Document,
  trend: KeywordTrendView,
  className = 'keyword-trend',
): HTMLElement => {
  const wrapper = document.createElement('span')
  wrapper.className = className
  if (trend.kind === 'unavailable') {
    wrapper.textContent = '—'
    return wrapper
  }
  if (trend.kind === 'insufficient') {
    wrapper.classList.add('keyword-trend--insufficient')
    wrapper.textContent = '样本不足（' + trend.sampleCount + '/6）'
    return wrapper
  }

  const points = trend.segments.flat()
  if (points.length === 0) {
    wrapper.textContent = '—'
    return wrapper
  }
  const min = Math.min(...points.map((point) => point.searches))
  const max = Math.max(...points.map((point) => point.searches))
  const xScale = Math.max(1, trend.pointCount - 1)
  const toX = (point: KeywordTrendPoint): number => 6 + point.index / xScale * 108
  const toY = (point: KeywordTrendPoint): number => max === min
    ? 14
    : 24 - (point.searches - min) / (max - min) * 20
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 120 28')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', '搜索量趋势，共 ' + trend.sampleCount + ' 个有效月度样本')
  svg.setAttribute('focusable', 'false')

  for (const segment of trend.segments) {
    if (segment.length === 1) {
      const point = segment[0]!
      const circle = document.createElementNS(SVG_NS, 'circle')
      circle.setAttribute('cx', String(toX(point)))
      circle.setAttribute('cy', String(toY(point)))
      circle.setAttribute('r', '2')
      svg.append(circle)
      continue
    }
    const line = document.createElementNS(SVG_NS, 'polyline')
    line.setAttribute('points', segment.map((point) => String(toX(point)) + ',' + String(toY(point))).join(' '))
    svg.append(line)
  }
  wrapper.append(svg)
  return wrapper
}
