import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import type { TrendMetric } from '@cookie-amazon/analytics'
import { downloadCsv } from './csv'
import { DEFAULT_QUERY, type ProductResearchQuery } from './input'
import { buildOpportunityReport, opportunityProductsToCsv } from './opportunity'
import { ProductResults } from './ProductResults'
import { useProductResearch } from './useProductResearch'

const METRIC_LABELS: Record<TrendMetric, string> = {
  estimatedSales: '月销量',
  price: '价格',
  rating: '评分',
  reviews: '评论数',
}

const MARKET_OPTIONS = [
  ['US', '美国'], ['JP', '日本'], ['GB', '英国'], ['DE', '德国'], ['FR', '法国'],
  ['IT', '意大利'], ['ES', '西班牙'], ['CA', '加拿大'], ['IN', '印度'], ['MX', '墨西哥'],
] as const

const formatCompact = (value: number | null): string => {
  if (value === null) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const formatMoney = (value: number | null): string =>
  value === null ? '—' : `$${formatCompact(value)}`

const updateQuery = <K extends keyof ProductResearchQuery>(
  query: ProductResearchQuery,
  key: K,
  value: ProductResearchQuery[K],
): ProductResearchQuery => ({ ...query, [key]: value })

export function ProductResearchWorkbench({
  targetId,
  targetReady = false,
  onConnect,
  connectionMessage,
  connecting = false,
}: {
  targetId: string
  targetReady?: boolean
  onConnect?: () => void
  connectionMessage?: string | null
  connecting?: boolean
}): ReactElement {
  const [metric, setMetric] = useState<TrendMetric>('estimatedSales')
  const [query, setQuery] = useState<ProductResearchQuery>(DEFAULT_QUERY)
  const [minOpportunity, setMinOpportunity] = useState('0')
  const [category, setCategory] = useState('all')
  const { products, opportunityProducts, series, trends, refreshing, loading, error, source, snapshots, refresh } = useProductResearch(
    targetId,
    metric,
    targetReady,
  )

  const categories = useMemo(() => [...new Set(opportunityProducts.map((product) => product.category))], [opportunityProducts])
  const visibleProducts = useMemo(() => opportunityProducts
    .filter((product) => (product.opportunity ?? 0) >= Number(minOpportunity || 0))
    .filter((product) => category === 'all' || product.category === category)
    .sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1)), [category, minOpportunity, opportunityProducts])
  const report = useMemo(() => buildOpportunityReport(visibleProducts), [visibleProducts])
  const latestTrends = useMemo(() => trends.slice(0, 6), [trends])

  const runSearch = (): void => { void refresh(query) }
  const exportProducts = (): void => downloadCsv(`amazon-${query.market.toLowerCase()}-opportunity.csv`, opportunityProductsToCsv(visibleProducts))

  return (
    <section className="product-research" aria-label="亚马逊选品工作台">
      <header className="pr-workbench-header">
        <div>
          <div className="pr-eyebrow"><span className="pr-eyebrow-dot" /> PRODUCT INTELLIGENCE · {query.market}</div>
          <h2>发现下一款 <em>值得卖</em> 的产品</h2>
          <p>从需求、竞争和评价密度切入，把 SellerSprite 的原始数据变成可执行的选品判断。</p>
        </div>
        <div className="pr-header-actions">
          <span className={`pr-connection ${targetReady ? 'is-live' : 'is-demo'}`}><i />{targetReady ? '扩展已连接 · Live' : '演示数据 · Demo'}</span>
          {!targetReady && onConnect ? <button type="button" className="pr-ghost-button" onClick={onConnect} disabled={connecting}>{connecting ? '连接中…' : '连接 SellerSprite'}</button> : null}
        </div>
      </header>

      <div className="pr-search-panel">
        <label className="pr-keyword-field">
          <span>搜索关键词</span>
          <div className="pr-input-wrap"><span>⌕</span><input value={query.keyword} onChange={(event) => setQuery(updateQuery(query, 'keyword', event.target.value))} placeholder="例如 wireless charger" maxLength={80} autoComplete="off" onKeyDown={(event) => { if (event.key === 'Enter') runSearch() }} /></div>
        </label>
        <label className="pr-market-field">
          <span>站点</span>
          <select value={query.market} onChange={(event) => setQuery(updateQuery(query, 'market', event.target.value))}>
            {MARKET_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label} · {code}</option>)}
          </select>
        </label>
        <button type="button" className="pr-search-button" disabled={refreshing} onClick={runSearch}>{refreshing ? <><span className="pr-spinner" />扫描中…</> : '开始扫描 →'}</button>
      </div>

      <div className="pr-capability-strip">
        <span><b className="lane-api">v3</b> API-first · 商品研究</span>
        <span><b className="lane-dom">v2</b> DOM-scrape · 关键词 / 市场</span>
        <span className="pr-capability-note">Cookie 由浏览器会话自动携带，不落盘</span>
      </div>

      {connectionMessage ? <div className="pr-connection-feedback" role="status"><span>连接状态</span><strong>{connectionMessage}</strong></div> : null}
      {source === 'demo' ? <div className="pr-demo-notice" role="status"><span>◌</span><div><strong>当前使用演示数据</strong><small>连接 SellerSprite 扩展并授权后，下一次扫描会自动切换到 v3 API 实时结果。</small></div>{onConnect ? <button type="button" onClick={onConnect} disabled={connecting}>{connecting ? '连接中…' : '去连接'}</button> : null}</div> : null}
      {error ? <div className="pr-error" role="alert"><strong>扫描未完成</strong><span>{error === 'KEYWORD_REQUIRED' ? '请输入关键词后再扫描' : error === 'TARGET_NOT_READY' ? 'SellerSprite 尚未连接，已阻止使用演示数据伪装实时扫描。请先连接 SellerSprite。' : error}</span></div> : null}

      <div className="pr-kpi-grid" aria-label="选品摘要">
        <article className="pr-kpi-card"><span>结果商品</span><strong>{loading ? '…' : report.total}</strong><small>当前筛选范围</small><b className="kpi-mark">◫</b></article>
        <article className="pr-kpi-card"><span>平均月销售额</span><strong>{formatMoney(report.averageRevenue)}</strong><small>按商品预估销量 × 价格</small><b className="kpi-mark">↗</b></article>
        <article className="pr-kpi-card"><span>中位机会分</span><strong>{report.medianOpportunity ?? '—'}<i>/99</i></strong><small>{report.highPotential} 个高潜商品</small><b className="kpi-mark">✦</b></article>
        <article className="pr-kpi-card"><span>平均月销量</span><strong>{formatCompact(report.averageSales)}</strong><small>来自 SellerSprite 估算</small><b className="kpi-mark">◒</b></article>
      </div>

      <div className="pr-content-grid">
        <div className="pr-main-column">
          <div className="pr-section-heading"><div><span className="pr-section-index">01</span><h3>机会清单</h3><span className="pr-count">{visibleProducts.length} / {products.length}</span></div><button type="button" className="pr-export-button" onClick={exportProducts} disabled={visibleProducts.length === 0}>下载 CSV ↧</button></div>
          <div className="pr-filters">
            <label>最小机会分<select value={minOpportunity} onChange={(event) => setMinOpportunity(event.target.value)}><option value="0">全部</option><option value="60">60+</option><option value="70">70+</option><option value="80">80+</option></select></label>
            <label>类目<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">全部类目</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label>趋势指标<select value={metric} onChange={(event) => setMetric(event.target.value as TrendMetric)}>{Object.entries(METRIC_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <span className="pr-filter-hint">按机会分降序</span>
          </div>
          <ProductResults products={visibleProducts} market={query.market} />
        </div>

        <aside className="pr-side-column" aria-label="分析摘要">
          <section className="pr-report-card">
            <div className="pr-section-heading compact"><div><span className="pr-section-index">02</span><h3>分析摘要</h3></div><span className="pr-report-badge">analyze</span></div>
            <p className="pr-report-lede">这批结果里有 <strong>{report.highPotential} 个</strong> 商品值得优先验证供应链与广告成本。</p>
            <div className="pr-distribution">{report.distribution.map((item) => { const max = Math.max(...report.distribution.map((entry) => entry.count), 1); return <div className="pr-bar-row" key={item.label}><span>{item.label}</span><div><i style={{ width: `${(item.count / max) * 100}%` }} /></div><b>{item.count}</b></div> })}</div>
            <div className="pr-risk-list"><span>风险雷达</span>{report.risks.length > 0 ? report.risks.map((risk) => <p key={risk}><i>!</i>{risk}</p>) : <p className="risk-good"><i>✓</i>暂未发现明显结构性风险</p>}</div>
          </section>
          <section className="pr-history-card">
            <div className="pr-section-heading compact"><div><span className="pr-section-index">03</span><h3>历史追踪</h3></div><span className="pr-history-count">{snapshots.length} snapshots</span></div>
            {latestTrends.length > 0 ? <div className="pr-mini-trends">{latestTrends.map((trend) => <div key={trend.asin}><span>{trend.asin}</span><b>{trend.last === null ? '—' : trend.last.toLocaleString()}</b><em className={trend.direction === 'up' ? 'trend-up' : trend.direction === 'down' ? 'trend-down' : ''}>{trend.direction === 'up' ? '↗' : trend.direction === 'down' ? '↘' : '—'}</em></div>)}</div> : <p className="pr-history-empty">完成一次以上实时扫描后，这里会记录同一 ASIN 的价格、销量变化。</p>}
          </section>
        </aside>
      </div>

      <footer className="pr-workbench-footer"><span><i className="footer-dot" /> 数据通道：{source === 'demo' ? '本地演示' : 'SellerSprite v3 API'} · 站点 {query.market}</span><span>最近更新：{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></footer>
    </section>
  )
}
