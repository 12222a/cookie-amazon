import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { TrendMetric } from '@cookie-amazon/analytics'
import {
  listSellerSpriteAbaPeriods,
  researchSellerSpriteAba,
  WebSdkError,
  type SellerSpriteAbaPeriodsData,
  type SellerSpriteAbaResearchData,
} from '@cookie-amazon/web-sdk'
import {
  describeAbaExtensionError,
  getAbaMarket,
  prepareAbaSearch,
} from './aba-search'
import { downloadCsv } from './csv'
import {
  DEFAULT_QUERY,
  getMarketResearchMonthOptions,
  type ProductResearchQuery,
} from './input'
import { buildOpportunityReport, opportunityProductsToCsv } from './opportunity'
import { MarketResearchResults } from './MarketResearchResults'
import { ProductResults } from './ProductResults'
import type { MonthlyFieldCoverage } from './monthly-lookup'
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

const formatAbaPeriod = (label: string, reverseType: 'W' | 'M'): string => {
  if (reverseType === 'M' && /^\d{6}$/.test(label)) return `${label.slice(0, 4)}-${label.slice(4)}`
  if (reverseType === 'W' && /^\d{8}$/.test(label)) {
    return `${label.slice(0, 4)}-${label.slice(4, 6)}-${label.slice(6)}`
  }
  return label
}

const NEW_RELEASE_OPTIONS = [
  [1, '1 个月内上架'],
  [3, '3 个月内上架'],
  [6, '半年内上架'],
  [12, '1 年内上架'],
] as const

const monthNameLabel = (value: ProductResearchQuery['monthName']): string =>
  getMarketResearchMonthOptions().find((option) => option.value === value)?.label ?? value

const newReleaseLabel = (value: ProductResearchQuery['newReleaseNum']): string =>
  NEW_RELEASE_OPTIONS.find(([months]) => months === value)?.[1] ?? `${value} 个月内上架`

const formatCompact = (value: number | null): string => {
  if (value === null) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const formatPercent = (value: number | null): string =>
  value === null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`

const formatShare = (value: number | null | undefined): string =>
  value == null ? '—' : `${Math.round(value * 100)}%`

const formatMonthlyCoverage = (coverage: MonthlyFieldCoverage): string => [
  ['价格', coverage.price],
  ['评分', coverage.rating],
  ['评论数', coverage.reviews],
  ['Listing Age', coverage.listingAge],
  ['BSR', coverage.bsr],
].map(([label, ratio]) => `${label} ${Math.round(Number(ratio) * 100)}%`).join(' · ')

const updateQuery = <K extends keyof ProductResearchQuery>(
  query: ProductResearchQuery,
  key: K,
  value: ProductResearchQuery[K],
): ProductResearchQuery => ({ ...query, [key]: value })

export function ProductResearchWorkbench({
  targetId,
  targetReady = false,
  abaSupported = false,
  extensionVersion,
  onConnect,
  connectionMessage,
  connecting = false,
}: {
  targetId: string
  targetReady?: boolean
  abaSupported?: boolean
  extensionVersion?: string
  onConnect?: () => void
  connectionMessage?: string | null
  connecting?: boolean
}): ReactElement {
  const [metric, setMetric] = useState<TrendMetric>('estimatedSales')
  const [query, setQuery] = useState<ProductResearchQuery>(DEFAULT_QUERY)
  const [abaReverseType, setAbaReverseType] = useState<'W' | 'M'>('W')
  const [abaPeriods, setAbaPeriods] = useState<SellerSpriteAbaPeriodsData | null>(null)
  const [abaTable, setAbaTable] = useState('')
  const [abaData, setAbaData] = useState<SellerSpriteAbaResearchData | null>(null)
  const [abaStatus, setAbaStatus] = useState<'idle' | 'periods' | 'loading'>('idle')
  const [abaError, setAbaError] = useState<string | null>(null)
  const [minPriority, setMinPriority] = useState('0')
  const [category, setCategory] = useState('all')
  const { products, opportunityProducts, keywordReport, keywordLookup, monthlyLookup, marketResearch, series, trends, refreshing, loading, error, source, snapshots, refresh } = useProductResearch(
    targetId,
    metric,
    targetReady,
  )

  useEffect(() => {
    let active = true
    if (!targetReady || !abaSupported) {
      setAbaPeriods(null)
      setAbaTable('')
      setAbaData(null)
      setAbaStatus('idle')
      setAbaError(targetReady && !abaSupported
        ? `当前扩展${extensionVersion ? ` v${extensionVersion}` : ''}不包含 ABA 通道。请重新构建并在 chrome://extensions 重新加载扩展，然后刷新本页面。`
        : null)
      return () => { active = false }
    }
    setAbaStatus('periods')
    setAbaError(null)
    void listSellerSpriteAbaPeriods({ timeoutMs: 15_000 })
      .then((periods) => {
        if (!active) return
        setAbaPeriods(periods)
        setAbaTable(periods.weekTables[0]?.table ?? '')
        setAbaStatus('idle')
      })
      .catch((reason: unknown) => {
        if (!active) return
        setAbaStatus('idle')
        setAbaError(reason instanceof WebSdkError
          ? reason.targetMessage ?? reason.targetCode?.toString()
            ?? describeAbaExtensionError(reason.code, extensionVersion)
          : 'ABA_PERIODS_FAILED')
      })
    return () => { active = false }
  }, [abaSupported, extensionVersion, targetReady])

  const abaPeriodOptions = abaReverseType === 'W' ? abaPeriods?.weekTables ?? [] : abaPeriods?.monthTables ?? []
  const changeAbaReverseType = (reverseType: 'W' | 'M'): void => {
    setAbaReverseType(reverseType)
    const periods = reverseType === 'W' ? abaPeriods?.weekTables : abaPeriods?.monthTables
    setAbaTable(periods?.[0]?.table ?? '')
    setAbaData(null)
    setAbaError(null)
  }
  const runAbaSearch = async (page = 1): Promise<void> => {
    if (!abaSupported) {
      setAbaError(`当前扩展${extensionVersion ? ` v${extensionVersion}` : ''}不包含 ABA 通道。请重新构建并在 chrome://extensions 重新加载扩展，然后刷新本页面。`)
      return
    }
    const needsPeriods = abaTable === ''
    setAbaStatus(needsPeriods ? 'periods' : 'loading')
    setAbaError(null)
    try {
      const prepared = await prepareAbaSearch({
        targetReady,
        station: query.market,
        keyword: query.keyword,
        reverseType: abaReverseType,
        table: abaTable,
      }, () => listSellerSpriteAbaPeriods({ timeoutMs: 15_000 }))
      if (prepared.periods !== null) {
        setAbaPeriods(prepared.periods)
        setAbaTable(prepared.table)
      }
      setAbaStatus('loading')
      const data = await researchSellerSpriteAba({
        reverseType: abaReverseType,
        table: prepared.table,
        q: query.keyword.trim(),
        market: prepared.market,
        page,
        size: 50,
      }, { timeoutMs: 20_000 })
      setAbaData(data)
    } catch (reason: unknown) {
      setAbaError(reason instanceof WebSdkError
        ? reason.targetMessage ?? reason.targetCode?.toString()
          ?? describeAbaExtensionError(reason.code, extensionVersion)
        : reason instanceof Error ? reason.message : 'ABA_RESEARCH_FAILED')
    } finally {
      setAbaStatus('idle')
    }
  }

  const categories = useMemo(() => [...new Set(opportunityProducts.map((product) => product.category))], [opportunityProducts])
  const visibleProducts = useMemo(() => opportunityProducts
    .filter((product) => (product.researchPriority ?? 0) >= Number(minPriority || 0))
    .filter((product) => category === 'all' || product.category === category)
    .sort((a, b) => (b.researchPriority ?? -1) - (a.researchPriority ?? -1)), [category, minPriority, opportunityProducts])
  const report = useMemo(
    () => buildOpportunityReport(opportunityProducts, keywordReport),
    [keywordReport, opportunityProducts],
  )
  const latestTrends = useMemo(() => trends.slice(0, 6), [trends])
  const primaryMarket = marketResearch.data?.rows[0]
  const marketMonthOptions = getMarketResearchMonthOptions()
  const actualMarketFilters = marketResearch.filters
  const actualMarketFilterLabel = actualMarketFilters === null
    ? null
    : `${monthNameLabel(actualMarketFilters.monthName)} · 新品：${newReleaseLabel(actualMarketFilters.newReleaseNum)}`

  const keywordLookupMessage = keywordLookup.status === 'loading'
    ? `正在串行反查 ${keywordLookup.attemptedAsinCount} 个 ASIN，竞品结果已可用`
    : keywordLookup.status === 'partial'
      ? `ASIN 反查部分成功：${keywordLookup.successfulAsinCount}/${keywordLookup.attemptedAsinCount}`
      : keywordLookup.status === 'unavailable'
        ? '竞品扫描成功，但本次 ASIN 反查无可用数据或额度'
        : keywordLookup.status === 'unsupported-market'
          ? `站点 ${keywordLookup.market ?? ''} 的 marketId 尚未取得真实合同，未发起 ASIN 反查`
          : null

  const monthlyLookupMessage = monthlyLookup.status === 'loading'
    ? `月度快照等待串行读取 ${monthlyLookup.attemptedAsinCount} 个 ASIN`
    : monthlyLookup.status === 'partial'
      ? `月度快照部分成功：${monthlyLookup.successfulAsinCount}/${monthlyLookup.attemptedAsinCount}；字段覆盖 ${formatMonthlyCoverage(monthlyLookup.fieldCoverage)}`
      : monthlyLookup.status === 'unavailable'
        ? '本次月度接口没有返回可用商品快照；历史序列仍未验证'
        : monthlyLookup.status === 'unsupported-market'
          ? `站点 ${monthlyLookup.market ?? ''} 的月度接口参数值尚未验证，未发起请求`
          : monthlyLookup.status === 'complete'
            ? `已接入 ${monthlyLookup.successfulAsinCount} 个 ASIN 的月度商品快照；字段覆盖 ${formatMonthlyCoverage(monthlyLookup.fieldCoverage)}；历史曲线未接入`
            : null

  const marketResearchMessage = marketResearch.status === 'loading'
    ? `正在读取 SellerSprite 真实细分市场结果${actualMarketFilterLabel ? `；${actualMarketFilterLabel}` : ''}`
    : marketResearch.status === 'unavailable'
      ? `竞品扫描成功，但本次市场接口没有返回可解析结果${actualMarketFilterLabel ? `；${actualMarketFilterLabel}` : ''}`
      : marketResearch.status === 'unsupported-market'
        ? `站点 ${query.market} 的市场接口合同尚未验证，未发起请求`
        : marketResearch.status === 'complete'
          ? `已接入 ${marketResearch.data?.rows.length ?? 0} 个真实细分市场；${actualMarketFilterLabel ?? '筛选条件未记录'}；利润未接入`
          : null

  const runSearch = (): void => { void refresh(query) }
  const exportProducts = (): void => downloadCsv(`amazon-${query.market.toLowerCase()}-opportunity.csv`, opportunityProductsToCsv(visibleProducts))

  return (
    <section className="product-research" aria-label="亚马逊选品工作台">
      <header className="pr-workbench-header">
        <div>
          <div className="pr-eyebrow"><span className="pr-eyebrow-dot" /> PRODUCT INTELLIGENCE · {query.market}</div>
          <h2>发现下一款 <em>值得卖</em> 的产品</h2>
          <p>以竞品样本、ASIN 反查关键词和真实关键词指标构建初步市场分析；未接入维度明确留空。</p>
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
        <label className="pr-market-field pr-period-field">
          <span>统计周期</span>
          <select
            value={query.monthName}
            onChange={(event) => setQuery(updateQuery(
              query,
              'monthName',
              event.target.value as ProductResearchQuery['monthName'],
            ))}
          >
            {marketMonthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="pr-market-field pr-release-field">
          <span>新品定义</span>
          <select
            value={query.newReleaseNum}
            onChange={(event) => setQuery(updateQuery(
              query,
              'newReleaseNum',
              Number(event.target.value) as ProductResearchQuery['newReleaseNum'],
            ))}
          >
            {NEW_RELEASE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="button" className="pr-search-button" disabled={refreshing} onClick={runSearch}>{refreshing ? <><span className="pr-spinner" />扫描中…</> : '开始扫描 →'}</button>
      </div>

      <div className="pr-capability-strip">
        <span><b className="lane-api">v3</b> 竞品 + US ASIN 反查关键词</span>
        <span><b className="lane-dom">live</b> US 市场总量 / FBA / 集中度 / 新品；关键词趋势；月度商品快照</span>
        <span className="pr-capability-note">Cookie 由浏览器会话自动携带，不落盘</span>
      </div>

      {connectionMessage ? <div className="pr-connection-feedback" role="status"><span>连接状态</span><strong>{connectionMessage}</strong></div> : null}
      {keywordLookupMessage ? <div className="pr-connection-feedback" role="status"><span>关键词数据</span><strong>{keywordLookupMessage}</strong></div> : null}
      {monthlyLookupMessage ? <div className="pr-connection-feedback" role="status"><span>月度数据</span><strong>{monthlyLookupMessage}</strong></div> : null}
      {marketResearchMessage ? <div className="pr-connection-feedback" role="status"><span>市场数据</span><strong>{marketResearchMessage}</strong></div> : null}

      <section className="pr-aba-panel" aria-label="ABA 数据选品">
        <div className="pr-section-heading"><div><span className="pr-section-index">ABA</span><h3>ABA 数据选品 · 验证真实需求</h3>{abaData ? <span className="pr-count">{abaData.total.toLocaleString()} 词</span> : null}</div></div>
        <div className="pr-aba-controls">
          <label><span>粒度</span><select value={abaReverseType} onChange={(event) => changeAbaReverseType(event.target.value as 'W' | 'M')}><option value="W">周度</option><option value="M">月度</option></select></label>
          <label><span>具体周期</span><select value={abaTable} disabled={!abaSupported || abaStatus === 'periods' || abaPeriodOptions.length === 0} onChange={(event) => { setAbaTable(event.target.value); setAbaData(null) }}>
            {abaPeriodOptions.map((period) => <option key={period.table} value={period.table}>{formatAbaPeriod(period.label, abaReverseType)}</option>)}
          </select></label>
          <div className="pr-aba-context"><span>关键词</span><strong>{query.keyword.trim() || '等待上方输入'}</strong></div>
          <div className="pr-aba-context"><span>市场</span><strong>{query.market} · {getAbaMarket(query.market) ?? '不支持'}</strong></div>
          <button type="button" className="pr-search-button" disabled={!abaSupported || abaStatus !== 'idle'} onClick={() => { void runAbaSearch(1) }}>{!abaSupported ? '需要重载扩展' : abaStatus === 'periods' ? '加载周期…' : abaStatus === 'loading' ? '查询中…' : '查询 ABA →'}</button>
        </div>
        {abaError ? <div className="pr-error pr-aba-error" role="alert"><strong>ABA 查询未完成</strong><span>{abaError}</span></div> : null}
        {abaData ? <div className="pr-table-shell">
          <div className="pr-table-scroll"><table className="pr-products-table pr-aba-table"><thead><tr>
            <th scope="col">搜索词</th><th scope="col">ABA 排名</th><th scope="col">搜索量</th><th scope="col">点击 / 展现</th><th scope="col">购买量 / 购买率</th><th scope="col">商品数</th><th scope="col">排名变化</th><th scope="col">Top 3 点击 / 转化份额</th><th scope="col">类目</th>
          </tr></thead><tbody>{abaData.items.map((item, index) => <tr key={`${item.keyword}-${index}`}>
            <td className="pr-aba-keyword"><strong>{item.keyword}</strong>{item.keywordCn ? <small>{item.keywordCn}</small> : null}</td>
            <td className="pr-number">{formatCompact(item.searchRank)}</td><td className="pr-number">{formatCompact(item.searches)}</td>
            <td className="pr-number">{formatCompact(item.clicks)} / {formatCompact(item.impressions)}</td>
            <td className="pr-number">{formatCompact(item.purchases)} / {formatShare(item.purchaseRate)}</td>
            <td className="pr-number">{formatCompact(item.products)}</td>
            <td className="pr-number">{formatCompact(item.searchRankGrowthValue)} / {formatPercent(item.searchRankGrowthRate)}</td>
            <td className="pr-number">{formatShare(item.clickShareRate)} / {formatShare(item.cvsShareRate)}</td>
            <td>{item.departments.length > 0 ? item.departments.join(' / ') : '—'}</td>
          </tr>)}</tbody></table></div>
          <div className="pr-table-footer"><span>第 {abaData.page} / {abaData.pages || 1} 页 · 每页 {abaData.size} · SellerSprite ABA 原始统计</span><span className="pr-aba-pagination">
            <button type="button" disabled={abaStatus !== 'idle' || abaData.page <= 1} onClick={() => { void runAbaSearch(abaData.page - 1) }}>← 上一页</button>
            <button type="button" disabled={abaStatus !== 'idle' || !abaData.hasNextPage} onClick={() => { void runAbaSearch(abaData.page + 1) }}>下一页 →</button>
          </span></div>
        </div> : <div className="pr-empty"><span className="pr-empty-mark">⌕</span><div><strong>选择周度或月度周期后查询</strong><p>ABA 搜索频率排名用于验证关键词是否存在真实需求；关键词与市场沿用上方条件。</p></div></div>}
      </section>

      {source === 'demo' ? <div className="pr-demo-notice" role="status"><span>◌</span><div><strong>当前使用演示数据</strong><small>连接 SellerSprite 扩展并授权后，下一次扫描会自动切换到 v3 API 实时结果。</small></div>{onConnect ? <button type="button" onClick={onConnect} disabled={connecting}>{connecting ? '连接中…' : '去连接'}</button> : null}</div> : null}
      {error ? <div className="pr-error" role="alert"><strong>扫描未完成</strong><span>{error === 'KEYWORD_REQUIRED' ? '请输入关键词后再扫描' : error === 'TARGET_NOT_READY' ? 'SellerSprite 尚未连接，已阻止使用演示数据伪装实时扫描。请先连接 SellerSprite。' : error}</span></div> : null}

      <div className="pr-kpi-grid" aria-label="市场初步分析">
        <article className="pr-kpi-card"><span>真实市场月总销量</span><strong>{formatCompact(primaryMarket?.totalSales ?? null)}</strong><small>{primaryMarket?.marketName ?? '等待 SellerSprite 市场结果'}</small><b className="kpi-mark">Σ</b></article>
        <article className="pr-kpi-card"><span>市场商品总数</span><strong>{formatCompact(primaryMarket?.totalProducts ?? null)}</strong><small>SellerSprite 细分市场结果列</small><b className="kpi-mark">▦</b></article>
        <article className="pr-kpi-card"><span>FBA / AMZ / FBM</span><strong>{formatShare(primaryMarket?.fbaRatio)}</strong><small>{primaryMarket ? `${formatShare(primaryMarket.amzRatio)} AMZ · ${formatShare(primaryMarket.fbmRatio)} FBM` : '等待真实卖家类型数据'}</small><b className="kpi-mark">F</b></article>
        <article className="pr-kpi-card"><span>利润</span><strong>—</strong><small>真实结果列未验证，保持未接入</small><b className="kpi-mark">∅</b></article>
        <article className="pr-kpi-card"><span>初步市场分</span><strong>{report.marketScore ?? '—'}<i>/100</i></strong><small>{report.recommendation === 'GOOD_OPPORTUNITY' ? '初步判断：值得深入验证' : report.recommendation === 'WATCH' ? '初步判断：建议持续观察' : report.recommendation === 'DIFFICULT' ? '初步判断：进入难度较高' : '当前数据不足以定论'}</small><b className="kpi-mark">✦</b></article>
        <article className="pr-kpi-card"><span>市场数据覆盖度</span><strong>{loading ? '…' : `${Math.round(report.marketConfidence * 100)}%`}</strong><small>已纳入关键词与 Listing Age；Review 文本、属性和利润仍未接入</small><b className="kpi-mark">◫</b></article>
        <article className="pr-kpi-card"><span>预估市场月销量</span><strong>{formatCompact(report.marketMetrics.totalEstimatedSales)}</strong><small>当前结果商品销量合计</small><b className="kpi-mark">◒</b></article>
        <article className="pr-kpi-card"><span>Demand Score</span><strong>{keywordReport?.demandScore ?? '—'}<i>/100</i></strong><small>{keywordReport ? `${keywordReport.uniqueKeywordCount} 个去重词 · ${keywordReport.analyzedAsinCount} 个 ASIN` : keywordLookup.status === 'loading' ? '正在读取真实 ASIN 关键词指标' : '等待有效 ASIN 反查关键词数据'}</small><b className="kpi-mark">⌁</b></article>
        <article className="pr-kpi-card"><span>初步 Entry Score</span><strong>{report.entryScore ?? '—'}<i>/100</i></strong><small>评论壁垒、销量集中度、Listing Age 与关键词竞争</small><b className="kpi-mark">⇥</b></article>
        <article className="pr-kpi-card"><span>关键词搜索量</span><strong>{formatCompact(keywordReport?.uniqueSearchVolume ?? null)}</strong><small>去重关键词搜索量合计，非全市场总量</small><b className="kpi-mark">⌕</b></article>
        <article className="pr-kpi-card"><span>搜索趋势</span><strong>{formatPercent(keywordReport?.searchTrendGrowth ?? null)}</strong><small>{keywordReport?.maximumTrendMonths ? `最多 ${keywordReport.maximumTrendMonths} 个月趋势；最近 3 个月相对前 3 个月中位变化` : '等待真实月度趋势数据'}</small><b className="kpi-mark">↗</b></article>
        <article className="pr-kpi-card"><span>购买率</span><strong>{keywordReport?.medianPurchaseRate == null ? '—' : `${(keywordReport.medianPurchaseRate * 100).toFixed(2)}%`}</strong><small>SellerSprite 反查关键词购买率中位数</small><b className="kpi-mark">◎</b></article>
        <article className="pr-kpi-card"><span>关键词供需比</span><strong>{keywordReport?.medianSupplyDemandRatio?.toFixed(2) ?? '—'}</strong><small>SellerSprite 反查结果中位数</small><b className="kpi-mark">↔</b></article>
        <article className="pr-kpi-card"><span>新品 Listing Age</span><strong>{report.marketMetrics.medianListingAgeDays === null ? '—' : `${Math.round(report.marketMetrics.medianListingAgeDays)}d`}</strong><small>{report.marketMetrics.newListingShare === null ? '当前样本未提供' : `${Math.round(report.marketMetrics.newListingShare * 100)}% ≤ 365 天`}</small><b className="kpi-mark">◷</b></article>
      </div>

      {marketResearch.data ? <section className="pr-market-results" aria-label="SellerSprite 细分市场结果">
        <div className="pr-section-heading"><div><span className="pr-section-index">M</span><h3>真实细分市场数据</h3><span className="pr-count">{marketResearch.data.rows.length}</span></div></div>
        <MarketResearchResults data={marketResearch.data} filtersLabel={actualMarketFilterLabel ?? '筛选条件未记录'} />
      </section> : null}

      <div className="pr-content-grid">
        <div className="pr-main-column">
          <div className="pr-section-heading"><div><span className="pr-section-index">01</span><h3>商品研究清单</h3><span className="pr-count">{visibleProducts.length} / {products.length}</span></div><button type="button" className="pr-export-button" onClick={exportProducts} disabled={visibleProducts.length === 0}>下载 CSV ↧</button></div>
          <div className="pr-filters">
            <label>最低研究优先级<select value={minPriority} onChange={(event) => setMinPriority(event.target.value)}><option value="0">全部</option><option value="50">50+</option><option value="70">70+</option><option value="85">85+</option></select></label>
            <label>类目<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">全部类目</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label>趋势指标<select value={metric} onChange={(event) => setMetric(event.target.value as TrendMetric)}>{Object.entries(METRIC_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <span className="pr-filter-hint">按研究优先级降序</span>
          </div>
          <ProductResults products={visibleProducts} market={query.market} />
        </div>

        <aside className="pr-side-column" aria-label="分析摘要">
          <section className="pr-report-card">
            <div className="pr-section-heading compact"><div><span className="pr-section-index">02</span><h3>分析摘要</h3></div><span className="pr-report-badge">analyze</span></div>
            <p className="pr-report-lede">当前市场初步结论为 <strong>{report.recommendation === 'GOOD_OPPORTUNITY' ? '值得深入验证' : report.recommendation === 'WATCH' ? '建议持续观察' : report.recommendation === 'DIFFICULT' ? '进入难度较高' : '数据不足'}</strong>；Demand {report.demandScore ?? '—'} / Entry {report.entryScore ?? '—'}，已纳入真实关键词与 Listing Age 信号。</p>
            <div className="pr-distribution">{report.distribution.map((item) => { const max = Math.max(...report.distribution.map((entry) => entry.count), 1); return <div className="pr-bar-row" key={item.label}><span>{item.label}</span><div><i style={{ width: `${(item.count / max) * 100}%` }} /></div><b>{item.count}</b></div> })}</div>
            <div className="pr-risk-list"><span>风险与数据边界</span>{report.risks.length > 0 ? report.risks.map((risk) => <p key={risk}><i>!</i>{risk}</p>) : <p className="risk-good"><i>✓</i>当前结果未发现明显集中度或评论壁垒风险</p>}</div>
          </section>
          <section className="pr-history-card">
            <div className="pr-section-heading compact"><div><span className="pr-section-index">03</span><h3>关键词簇 / Niche</h3></div><span className="pr-history-count">{keywordReport?.niches.length ?? 0} clusters</span></div>
            {keywordReport && keywordReport.niches.length > 0 ? <div className="pr-niche-list">{keywordReport.niches.map((niche) => <div key={niche.id}><strong>{niche.label}</strong><span>{formatCompact(niche.searchVolume)} 搜索量 · {niche.keywordCount} 词 · {niche.asinCoverage} ASIN</span><small>{niche.keywords.slice(0, 3).join(' / ')}</small></div>)}</div> : <p className="pr-history-empty">完成实时扫描并取得 ASIN 反查结果后，使用词项重合度生成初步关键词簇。</p>}
          </section>
          <section className="pr-history-card">
            <div className="pr-section-heading compact"><div><span className="pr-section-index">04</span><h3>历史追踪</h3></div><span className="pr-history-count">{snapshots.length} snapshots</span></div>
            {latestTrends.length > 0 ? <div className="pr-mini-trends">{latestTrends.map((trend) => <div key={trend.asin}><span>{trend.asin}</span><b>{trend.last === null ? '—' : trend.last.toLocaleString()}</b><em className={trend.direction === 'up' ? 'trend-up' : trend.direction === 'down' ? 'trend-down' : ''}>{trend.direction === 'up' ? '↗' : trend.direction === 'down' ? '↘' : '—'}</em></div>)}</div> : <p className="pr-history-empty">完成一次以上实时扫描后，这里会记录同一 ASIN 的价格、销量变化。</p>}
          </section>
        </aside>
      </div>

      <footer className="pr-workbench-footer"><span><i className="footer-dot" /> 数据通道：{source === 'demo' ? '本地演示' : marketResearch.status === 'complete' ? 'SellerSprite v3 API + v2 市场结果' : 'SellerSprite v3 API'} · 站点 {query.market}</span><span>最近更新：{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></footer>
    </section>
  )
}
