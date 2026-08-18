import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import {
  seriesToCsv,
  toSparkline,
  trendsToCsv,
  type ProductSeries,
  type ProductTrend,
  type TrendMetric,
  type TrendSortKey,
} from '@cookie-amazon/analytics'
import { useProductResearch } from './useProductResearch'
import { DEFAULT_QUERY, type ProductResearchQuery } from './input'
import { downloadCsv } from './csv'
import {
  applyView,
  ariaSort,
  DEFAULT_FILTER,
  DEFAULT_SORT,
  toggleSelection,
  toggleSort,
  type FilterInput,
  type SortState,
} from './workbench-state'

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

const SORT_COLUMNS: { key: TrendSortKey; label: string }[] = [
  { key: 'asin', label: 'ASIN' },
  { key: 'title', label: '标题' },
  { key: 'first', label: '首值' },
  { key: 'last', label: '最新' },
  { key: 'absoluteChange', label: '变化' },
  { key: 'relativeChange', label: '幅度' },
  { key: 'sampleCount', label: '样本' },
]

const formatNumber = (value: number | null): string =>
  value === null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })

const formatPercent = (value: number | null): string =>
  value === null ? '—' : `${(value * 100).toFixed(1)}%`

function Sparkline({
  series,
  metric,
}: {
  series: ProductSeries | undefined
  metric: TrendMetric
}): ReactElement {
  const spark = useMemo(
    () => (series ? toSparkline(series, metric, { width: 96, height: 24 }) : null),
    [series, metric],
  )
  if (!spark || !spark.hasData) return <span className="pr-sparkline pr-sparkline--empty">—</span>
  return (
    <svg
      className="pr-sparkline"
      width={spark.width}
      height={spark.height}
      viewBox={`0 0 ${spark.width} ${spark.height}`}
      role="img"
      aria-label={`${METRIC_LABELS[metric]}趋势迷你图`}
    >
      <polyline points={spark.points} fill="none" stroke="#1769e0" strokeWidth="1.5" />
    </svg>
  )
}

export function ProductResearchWorkbench({ targetId }: { targetId: string }): ReactElement {
  const [metric, setMetric] = useState<TrendMetric>('estimatedSales')
  const [query, setQuery] = useState<ProductResearchQuery>(DEFAULT_QUERY)
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  const [filter, setFilter] = useState<FilterInput>(DEFAULT_FILTER)
  const [selected, setSelected] = useState<readonly string[]>([])
  const { snapshots, series, trends, refreshing, loading, error, refresh } = useProductResearch(
    targetId,
    metric,
  )

  const visibleTrends = useMemo(() => applyView(trends, sort, filter), [trends, sort, filter])
  const seriesByAsin = useMemo(() => {
    const map = new Map<string, ProductSeries>()
    for (const item of series) map.set(item.asin, item)
    return map
  }, [series])
  const compareTrends = useMemo(
    () => visibleTrends.filter((trend) => selected.includes(trend.asin)),
    [visibleTrends, selected],
  )

  const exportTrends = (): void => downloadCsv('product-trends.csv', trendsToCsv(visibleTrends))
  const exportSeries = (): void => downloadCsv('product-series.csv', seriesToCsv(series, metric))

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
    {trends.length > 0 && <div className="pr-filters">
      <label>
        趋势方向
        <select
          value={filter.direction}
          onChange={(event) =>
            setFilter({ ...filter, direction: event.target.value as FilterInput['direction'] })}
        >
          <option value="all">全部</option>
          <option value="up">上升</option>
          <option value="down">下降</option>
          <option value="flat">持平</option>
          <option value="unknown">数据不足</option>
        </select>
      </label>
      <label>
        最小样本
        <input
          type="number"
          min={0}
          value={filter.minSampleCount}
          onChange={(event) => setFilter({ ...filter, minSampleCount: event.target.value })}
        />
      </label>
      <label>
        关键字
        <input
          value={filter.query}
          onChange={(event) => setFilter({ ...filter, query: event.target.value })}
          placeholder="ASIN 或标题"
        />
      </label>
      <button type="button" className="pr-export" onClick={exportTrends}>导出 CSV</button>
      <button type="button" className="pr-export" onClick={exportSeries}>导出序列</button>
    </div>}
    {visibleTrends.length > 0 && <table className="pr-trends">
      <thead>
        <tr>
          <th scope="col">对比</th>
          {SORT_COLUMNS.map((column) =>
            <th key={column.key} scope="col" aria-sort={ariaSort(sort, column.key)}>
              <button type="button" onClick={() => setSort(toggleSort(sort, column.key))}>
                {column.label}
                {sort.key === column.key && (sort.direction === 'asc' ? ' ▲' : ' ▼')}
              </button>
            </th>)}
          <th scope="col">趋势</th>
          <th scope="col">迷你图</th>
        </tr>
      </thead>
      <tbody>
        {visibleTrends.map((trend) => <tr key={trend.asin}>
          <td>
            <input
              type="checkbox"
              aria-label={`对比 ${trend.asin}`}
              checked={selected.includes(trend.asin)}
              onChange={() => setSelected(toggleSelection(selected, trend.asin))}
            />
          </td>
          <td>{trend.asin}</td>
          <td>{trend.title ?? '—'}</td>
          <td>{formatNumber(trend.first)}</td>
          <td>{formatNumber(trend.last)}</td>
          <td>{formatNumber(trend.absoluteChange)}</td>
          <td>{formatPercent(trend.relativeChange)}</td>
          <td>{trend.sampleCount}</td>
          <td>{DIRECTION_LABELS[trend.direction]}</td>
          <td><Sparkline series={seriesByAsin.get(trend.asin)} metric={metric} /></td>
        </tr>)}
      </tbody>
    </table>}
    {compareTrends.length > 0 && <section className="pr-compare" aria-label="多 ASIN 对比">
      <h3>对比（{METRIC_LABELS[metric]}）</h3>
      <div className="pr-compare-grid">
        {compareTrends.map((trend) => <article key={trend.asin} className="pr-compare-card">
          <strong>{trend.asin}</strong>
          <small>{trend.title ?? '—'}</small>
          <dl>
            <dt>首值</dt><dd>{formatNumber(trend.first)}</dd>
            <dt>最新</dt><dd>{formatNumber(trend.last)}</dd>
            <dt>变化</dt><dd>{formatNumber(trend.absoluteChange)}</dd>
          </dl>
          <Sparkline series={seriesByAsin.get(trend.asin)} metric={metric} />
        </article>)}
      </div>
    </section>}
  </section>
}