import type { ReactElement } from 'react'
import { useState } from 'react'
import type { ProductTrend, TrendMetric } from '@cookie-amazon/analytics'
import { useProductResearch } from './useProductResearch'
import { DEFAULT_QUERY, type ProductResearchQuery } from './input'

const METRIC_LABELS: Record<TrendMetric, string> = {
  price: '价格',
  rating: '评分',
  reviews: '评论数',
  estimatedSales: '预估销量',
}

const DIRECTION_LABELS: Record<ProductTrend['direction'], string> = {
  up: '上升',
  down: '下降',
  flat: '持平',
  unknown: '数据不足',
}

const formatNumber = (value: number | null): string =>
  value === null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })

const formatPercent = (value: number | null): string =>
  value === null ? '—' : `${(value * 100).toFixed(1)}%`

export function ProductResearchWorkbench({ targetId }: { targetId: string }): ReactElement {
  const [metric, setMetric] = useState<TrendMetric>('estimatedSales')
  const [query, setQuery] = useState<ProductResearchQuery>(DEFAULT_QUERY)
  const { snapshots, trends, refreshing, loading, error, refresh } = useProductResearch(
    targetId,
    metric,
  )

  return <section className="product-research" aria-label="产品研究工作台">
    <h2>产品研究</h2>
    <div className="pr-controls">
      <label>
        市场
        <input
          value={query.market}
          onChange={(event) => setQuery({ ...query, market: event.target.value })}
        />
      </label>
      <label>
        排序字段
        <input
          value={query.orderField}
          onChange={(event) => setQuery({ ...query, orderField: event.target.value })}
        />
      </label>
      <label>
        指标
        <select value={metric} onChange={(event) => setMetric(event.target.value as TrendMetric)}>
          {(Object.keys(METRIC_LABELS) as TrendMetric[]).map((key) =>
            <option key={key} value={key}>{METRIC_LABELS[key]}</option>)}
        </select>
      </label>
      <button type="button" disabled={refreshing} onClick={() => void refresh(query)}>
        {refreshing ? '刷新中…' : '手动刷新'}
      </button>
    </div>
    <p className="pr-summary" role="status">
      历史快照：{loading ? '加载中…' : `${snapshots.length} 个`}
    </p>
    {error && <p role="alert">刷新失败：{error}</p>}
    {trends.length > 0 && <table className="pr-trends">
      <thead>
        <tr>
          <th>ASIN</th>
          <th>标题</th>
          <th>首值</th>
          <th>最新</th>
          <th>变化</th>
          <th>幅度</th>
          <th>趋势</th>
          <th>样本</th>
        </tr>
      </thead>
      <tbody>
        {trends.map((trend) => <tr key={trend.asin}>
          <td>{trend.asin}</td>
          <td>{trend.title ?? '—'}</td>
          <td>{formatNumber(trend.first)}</td>
          <td>{formatNumber(trend.last)}</td>
          <td>{formatNumber(trend.absoluteChange)}</td>
          <td>{formatPercent(trend.relativeChange)}</td>
          <td>{DIRECTION_LABELS[trend.direction]}</td>
          <td>{trend.sampleCount}</td>
        </tr>)}
      </tbody>
    </table>}
  </section>
}