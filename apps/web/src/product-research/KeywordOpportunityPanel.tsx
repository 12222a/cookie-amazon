import { useMemo, useState, type ReactElement } from 'react'
import {
  mineSellerSpriteKeywords,
  readSellerSpriteMonthly,
  researchSellerSpriteCompetitors,
  researchSellerSpriteMarket,
  reverseSellerSpriteKeywords,
  listSellerSpriteReviewComments,
  WebSdkError,
  type SellerSpriteCompetitorData,
  type SellerSpriteKeywordMiningData,
  type SellerSpriteMarketResearchData,
} from '@cookie-amazon/web-sdk'
import {
  buildCompetitorResearchInput,
  buildKeywordMiningInput,
  buildMarketResearchInput,
  buildMonthlyInput,
  buildKeywordReverseInput,
  DEFAULT_QUERY,
  getMarketResearchMonthOptions,
  type ProductResearchQuery,
} from './input'
import { buildP0ReviewCommentsInput, summarizeP0Reviews, type P0ReviewSummary } from './p0-opportunity'
import { downloadCsv } from './csv'
import {
  buildKeywordOpportunityReport,
  keywordOpportunityToCsv,
  mergeKeywordCompetitorPages,
  type KeywordCandidateEvidence,
  type KeywordOpportunityFilters,
  type KeywordOpportunityInput,
  type KeywordOpportunityReport,
  type KeywordSourcePageCount,
} from './keyword-opportunity'

const formatNumber = (value: number | null | undefined): string => value == null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 1 })
const formatMoney = (value: number | null | undefined): string => value == null ? '—' : `$${value.toFixed(2)}`
const formatPercent = (value: number | null | undefined): string => value == null ? '—' : `${(value * 100).toFixed(1)}%`
const errorText = (reason: unknown): string => reason instanceof WebSdkError
  ? reason.targetMessage ?? reason.targetCode?.toString() ?? reason.code
  : reason instanceof Error ? reason.message : 'KEYWORD_RESEARCH_FAILED'

const emptyFilters: KeywordOpportunityFilters = {
  minPrice: 15,
  maxPrice: 50,
  minSales: 100,
  maxReviews: 1_000,
  minRating: 3.5,
  maxSellers: null,
}

const marketMonthOptions = getMarketResearchMonthOptions()
const KEYWORD_SOURCE_PAGE_OPTIONS: readonly KeywordSourcePageCount[] = [1, 3, 5]

type DeepReview = { status: KeywordCandidateEvidence['reviews']; summary: P0ReviewSummary | null; error: string | null }
type KeywordResearchResult = { report: KeywordOpportunityReport; keywordData: SellerSpriteKeywordMiningData | null; marketData: SellerSpriteMarketResearchData | null }

export function KeywordOpportunityPanel({
  targetReady,
  hidden = false,
}: {
  targetReady: boolean
  hidden?: boolean
}): ReactElement {
  const [query, setQuery] = useState<ProductResearchQuery>({ ...DEFAULT_QUERY, size: 60 })
  const [sourcePages, setSourcePages] = useState<KeywordSourcePageCount>(3)
  const [filters, setFilters] = useState<KeywordOpportunityFilters>(emptyFilters)
  const [result, setResult] = useState<KeywordResearchResult | null>(null)
  const [selectedAsin, setSelectedAsin] = useState<string | null>(null)
  const [reviews, setReviews] = useState<Record<string, DeepReview>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'partial' | 'complete' | 'empty' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)

  const input: KeywordOpportunityInput = useMemo(() => ({
    keyword: query.keyword.trim(), market: query.market, monthName: query.monthName, newReleaseNum: query.newReleaseNum, filters,
  }), [filters, query.keyword, query.market, query.monthName, query.newReleaseNum])
  const selected = result?.report.candidates.find((candidate) => candidate.asin === selectedAsin) ?? result?.report.candidates[0] ?? null

  const updateCandidate = (asin: string, update: (candidate: KeywordResearchResult['report']['candidates'][number]) => KeywordResearchResult['report']['candidates'][number]): void => {
    setResult((current) => current === null ? current : { ...current, report: { ...current.report, candidates: current.report.candidates.map((candidate) => candidate.asin === asin ? update(candidate) : candidate) } })
  }

  const runResearch = async (): Promise<void> => {
    if (!targetReady) { setError('SellerSprite 尚未连接，请先连接扩展后再开始关键词机会研究。'); setStatus('failed'); return }
    if (input.keyword.length === 0) { setError('请输入关键词后再开始研究。'); setStatus('failed'); return }
    setStatus('loading'); setError(null); setResult(null); setSelectedAsin(null); setReviews({})
    try {
      const competitorPromise = (async (): Promise<SellerSpriteCompetitorData> => {
        const pages: SellerSpriteCompetitorData[] = []
        for (let page = 1; page <= sourcePages; page += 1) {
          const competitorInput = buildCompetitorResearchInput({ ...query, keyword: input.keyword, page, size: 60 })
          const pageData = await researchSellerSpriteCompetitors(competitorInput, { timeoutMs: 25_000 })
          pages.push(pageData)
          if (!pageData.hasNextPage || page >= pageData.pages) break
        }
        return mergeKeywordCompetitorPages(pages)
      })()
      const keywordPromise = query.market === 'US'
        ? mineSellerSpriteKeywords(buildKeywordMiningInput(input.keyword, query.market, 1, 50), { timeoutMs: 20_000 })
        : Promise.resolve(null)
      const marketPromise = query.market === 'US'
        ? researchSellerSpriteMarket(buildMarketResearchInput(input.keyword, query.market, query.monthName, query.newReleaseNum), { timeoutMs: 25_000 })
        : Promise.resolve(null)
      const [competitorResult, keywordResult, marketResult] = await Promise.allSettled([competitorPromise, keywordPromise, marketPromise])
      if (competitorResult.status === 'rejected') throw competitorResult.reason
      const keywordData = keywordResult.status === 'fulfilled' ? keywordResult.value : null
      const marketData = marketResult.status === 'fulfilled' ? marketResult.value : null
      const report = buildKeywordOpportunityReport(competitorResult.value, input, keywordData, marketData)
      setResult({ report, keywordData, marketData })
      setStatus(report.candidates.length === 0 ? 'empty' : keywordResult.status === 'rejected' || marketResult.status === 'rejected' ? 'partial' : 'complete')
      if (report.candidates.length > 0) setSelectedAsin(report.candidates[0].asin)
      setReviews(Object.fromEntries(report.candidates.map((candidate) => [candidate.asin, { status: candidate.rank <= 3 ? 'queued' : 'unavailable', summary: null, error: null }])))
      await enrichTopCandidates(report.candidates.slice(0, 3), input.market)
    } catch (reason: unknown) {
      setError(errorText(reason)); setStatus('failed')
    }
  }

  const enrichTopCandidates = async (candidates: KeywordResearchResult['report']['candidates'], market: string): Promise<void> => {
    for (const candidate of candidates) {
      const setReviewStatus = (next: DeepReview['status'], reviewError: string | null = null): void => {
        setReviews((current) => ({ ...current, [candidate.asin]: { ...(current[candidate.asin] ?? { summary: null }), status: next, error: reviewError } }))
        updateCandidate(candidate.asin, (item) => ({ ...item, evidence: { ...item.evidence, reviews: next } }))
      }
      setReviewStatus('loading')
      try {
        const reviewData = await listSellerSpriteReviewComments(buildP0ReviewCommentsInput(candidate.asin, market), { timeoutMs: 20_000 })
        const summary = summarizeP0Reviews(reviewData)
        setReviews((current) => ({ ...current, [candidate.asin]: { status: 'complete', summary, error: null } }))
        updateCandidate(candidate.asin, (item) => ({ ...item, evidence: { ...item.evidence, reviews: 'complete' }, missingEvidence: item.missingEvidence.filter((value) => value !== '评论样本') }))
      } catch (reason: unknown) { setReviewStatus('failed', errorText(reason)) }
      const setEvidence = (key: 'keywordReverse' | 'monthlySnapshot', next: KeywordCandidateEvidence[typeof key]): void => {
        updateCandidate(candidate.asin, (item) => ({ ...item, evidence: { ...item.evidence, [key]: next } }))
      }
      setEvidence('keywordReverse', 'loading')
      try { await reverseSellerSpriteKeywords(buildKeywordReverseInput(candidate.asin, market), { timeoutMs: 20_000 }); setEvidence('keywordReverse', 'complete') }
      catch { setEvidence('keywordReverse', 'failed') }
      setEvidence('monthlySnapshot', 'loading')
      try { await readSellerSpriteMonthly(buildMonthlyInput(candidate.asin, market), { timeoutMs: 20_000 }); setEvidence('monthlySnapshot', 'complete') }
      catch { setEvidence('monthlySnapshot', 'failed') }
    }
  }

  const exportResult = (): void => { if (result) downloadCsv(`keyword-opportunity-${query.market.toLowerCase()}.csv`, keywordOpportunityToCsv(result.report, input)) }
  const statusLabel = status === 'loading' ? '正在读取 SellerSprite 多维数据…' : status === 'partial' ? '商品结果已返回，关键词或市场补证部分失败' : status === 'complete' ? '商品、关键词和市场数据已返回，Top 3 正在补充证据' : status === 'empty' ? '当前关键词和筛选条件没有符合条件的商品' : status === 'failed' ? error ?? '研究未完成' : '输入关键词后开始一轮真实机会研究'
  const updateFilter = (key: keyof KeywordOpportunityFilters, value: string): void => setFilters((current) => ({ ...current, [key]: value === '' ? null : Number(value) }))
  const review = selected ? reviews[selected.asin] : null
  const primaryKeyword = result?.keywordData?.items.find((item) => item.keyword.toLowerCase() === input.keyword.toLowerCase()) ?? result?.keywordData?.items[0] ?? null
  const primaryMarket = result?.marketData?.rows[0] ?? null

  return <section className="keyword-opportunity" hidden={hidden} aria-label="关键词机会研究">
    <header className="keyword-opportunity-intro"><div><span>KEYWORD OPPORTUNITY RESEARCH</span><h3>关键词机会研究</h3><p>综合需求、市场结构、进入条件和重点 ASIN 证据，不把 SellerSprite 的单次结果直接当成选品结论。</p></div><span className={`keyword-live-badge ${targetReady ? 'is-ready' : ''}`}>{targetReady ? 'SELLERSPRITE · LIVE' : '等待连接 SellerSprite'}</span></header>
    <div className="keyword-query-card">
      <label className="keyword-query-main"><span>关键词</span><input value={query.keyword} maxLength={80} placeholder="例如 wireless charger" onChange={(event) => setQuery((current) => ({ ...current, keyword: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') void runResearch() }} /></label>
      <label><span>站点</span><select value={query.market} onChange={(event) => setQuery((current) => ({ ...current, market: event.target.value }))}><option value="US">美国 · US</option><option value="JP">日本 · JP</option><option value="GB">英国 · GB</option><option value="DE">德国 · DE</option></select></label>
      <label><span>统计周期</span><select value={query.monthName} onChange={(event) => setQuery((current) => ({ ...current, monthName: event.target.value as ProductResearchQuery['monthName'] }))}>{marketMonthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label><span>新品定义</span><select value={query.newReleaseNum} onChange={(event) => setQuery((current) => ({ ...current, newReleaseNum: Number(event.target.value) as ProductResearchQuery['newReleaseNum'] }))}><option value="3">3 个月内</option><option value="6">6 个月内</option><option value="12">12 个月内</option></select></label>
      <label><span>商品数据范围</span><select value={sourcePages} onChange={(event) => {
        const pages = Number(event.target.value)
        if (pages === 1 || pages === 3 || pages === 5) setSourcePages(pages)
      }}>{KEYWORD_SOURCE_PAGE_OPTIONS.map((pages) => <option key={pages} value={pages}>{pages === 1 ? '快速' : pages === 3 ? '标准' : '深度'} · 最多 {pages * 60} 条</option>)}</select></label>
      <button type="button" className="pr-search-button" disabled={status === 'loading'} onClick={() => { void runResearch() }}>{status === 'loading' ? '研究中…' : !targetReady ? '需要连接扩展' : '开始综合研究 →'}</button>
      <div className="keyword-filters"><span>硬性筛选</span><label>最低价格<input type="number" min="0" value={filters.minPrice ?? ''} onChange={(event) => updateFilter('minPrice', event.target.value)} /></label><label>最高价格<input type="number" min="0" value={filters.maxPrice ?? ''} onChange={(event) => updateFilter('maxPrice', event.target.value)} /></label><label>最低月销量<input type="number" min="0" value={filters.minSales ?? ''} onChange={(event) => updateFilter('minSales', event.target.value)} /></label><label>最高评论<input type="number" min="0" value={filters.maxReviews ?? ''} onChange={(event) => updateFilter('maxReviews', event.target.value)} /></label><label>最低评分<input type="number" min="0" max="5" step=".1" value={filters.minRating ?? ''} onChange={(event) => updateFilter('minRating', event.target.value)} /></label><label>最高卖家数<input type="number" min="0" value={filters.maxSellers ?? ''} onChange={(event) => updateFilter('maxSellers', event.target.value)} /></label></div>
    </div>
    <div className={`keyword-research-status is-${status}`} role="status"><i />{statusLabel}</div>
    {result ? <><div className="keyword-summary-grid"><article><span>关键词总结果</span><strong>{formatNumber(result.report.totalReturned)}</strong><small>本轮读取 {result.report.sampledCount} 条 · 去重后 {result.report.uniqueCount} 个 ASIN</small></article><article><span>符合筛选</span><strong>{result.report.matchedCount}</strong><small>按当前硬条件匹配 · 全部候选均已保留</small></article><article><span>需求信号</span><strong>{result.report.demandSignal === 'available' ? '已取得' : '—'}</strong><small>{result.keywordData ? `关键词挖掘 ${result.keywordData.items.length} 条` : '未返回有效数据'}</small></article><article><span>市场结构</span><strong>{result.marketData ? '已取得' : '—'}</strong><small>{result.marketData ? `${result.marketData.rows.length} 个市场行` : '未返回有效数据'}</small></article><article><span>证据覆盖</span><strong>{result.report.evidenceCoverage}%</strong><small>当前候选基础字段</small></article><article><span>利润</span><strong>—</strong><small>采购、物流、广告和税费未接入</small></article></div><div className="keyword-signal-grid"><article><span>关键词搜索量</span><strong>{formatNumber(primaryKeyword?.searches)}</strong><small>SellerSprite 关键词挖掘</small></article><article><span>购买量 / 购买率</span><strong>{formatNumber(primaryKeyword?.purchases)} / {formatPercent(primaryKeyword?.purchaseRate)}</strong><small>需求转化信号</small></article><article><span>供需比</span><strong>{primaryKeyword?.supplyDemandRatio?.toFixed(2) ?? '—'}</strong><small>关键词竞争压力</small></article><article><span>市场月总销量</span><strong>{formatNumber(primaryMarket?.totalSales)}</strong><small>细分市场真实结果</small></article><article><span>商品集中度</span><strong>{formatPercent(primaryMarket?.productConcentration)}</strong><small>头部商品集中度</small></article><article><span>新品占比</span><strong>{formatPercent(primaryMarket?.newProductRatio)}</strong><small>新品进入信号</small></article></div>{result.report.filterWarnings.map((warning) => <div className="keyword-warning" key={warning}>{warning}</div>)}</> : null}
    <div className="keyword-research-layout"><section className="keyword-candidates panel-like"><div className="keyword-panel-head"><div><b>01</b><h4>关键词候选商品</h4><small>机会分排序 · 完整候选列表</small></div><button type="button" className="pr-export-button" disabled={!result} onClick={exportResult}>下载 CSV ↧</button></div>{result?.report.candidates.length ? <div className="keyword-table-scroll"><table className="keyword-table"><thead><tr><th>商品 / ASIN</th><th>价格</th><th>月销量</th><th>评分 / 评论</th><th>机会分</th><th>可信度</th><th>状态</th></tr></thead><tbody>{result.report.candidates.map((candidate) => <tr key={candidate.asin} className={selected?.asin === candidate.asin ? 'is-selected' : ''} onClick={() => setSelectedAsin(candidate.asin)}><td><div className="keyword-product"><div>{candidate.imageUrl ? <img src={candidate.imageUrl} alt="" loading="lazy" /> : <span className="keyword-image-fallback">AMZ</span>}</div><div><strong>{candidate.title || '未提供标题'}</strong><small>{candidate.brand || '未标注品牌'} · {candidate.asin}</small></div></div></td><td>{formatMoney(candidate.price)}</td><td>{formatNumber(candidate.estimatedSales)}</td><td>{candidate.rating == null ? '—' : `★ ${candidate.rating.toFixed(1)}`}<small>{formatNumber(candidate.reviews)} reviews</small></td><td><b className="keyword-score">{candidate.opportunityScore}</b></td><td>{candidate.evidenceConfidence}%</td><td><span className={`keyword-status status-${candidate.status === '重点验证' ? 'focus' : candidate.status === '待补充研究' ? 'watch' : 'defer'}`}>{candidate.status}</span></td></tr>)}</tbody></table></div> : <div className="keyword-empty"><b>⌕</b><strong>{status === 'empty' ? '没有符合条件的真实商品' : '等待关键词机会研究'}</strong><p>{status === 'empty' ? '请放宽价格、销量或评论筛选条件后重试。' : '查询后会在这里展示真实 ASIN、多维机会分和证据状态。'}</p></div>}</section>
      <aside className="keyword-detail panel-like"><div className="keyword-panel-head"><div><b>02</b><h4>候选详情与证据</h4></div></div>{selected ? <div className="keyword-detail-body"><h4>{selected.title || selected.asin}</h4><p className="keyword-asin">{selected.brand || '未标注品牌'} · {selected.asin}</p><div className="keyword-detail-score"><span>机会分</span><strong>{selected.opportunityScore}</strong><em>{selected.status}</em></div><div className="keyword-detail-metrics"><div><span>需求分</span><b>{selected.demandScore ?? '—'}</b></div><div><span>竞争友好</span><b>{selected.competitionScore ?? '—'}</b></div><div><span>进入分</span><b>{selected.entryScore ?? '—'}</b></div><div><span>证据覆盖</span><b>{selected.evidenceConfidence}%</b></div></div><h5>重点补证状态</h5><div className="keyword-evidence-status"><span>关键词反查 <b>{selected.evidence.keywordReverse === 'complete' ? '已完成' : selected.evidence.keywordReverse === 'failed' ? '失败' : selected.evidence.keywordReverse === 'loading' ? '读取中' : '排队中'}</b></span><span>月度快照 <b>{selected.evidence.monthlySnapshot === 'complete' ? '已完成' : selected.evidence.monthlySnapshot === 'failed' ? '失败' : selected.evidence.monthlySnapshot === 'loading' ? '读取中' : '排队中'}</b></span><span>评论分析 <b>{review?.status === 'complete' ? `样本 ${review.summary?.sampled ?? 0}` : review?.status === 'failed' ? '失败' : review?.status === 'loading' ? '读取中' : '排队中'}</b></span></div>{review?.summary?.painPoints.length ? <div className="keyword-pain"><h5>低星评论痛点</h5>{review.summary.painPoints.map((pain) => <p key={pain}>{pain}</p>)}</div> : null}<h5>缺失证据</h5><div className="keyword-missing">{selected.missingEvidence.map((missing) => <span key={missing}>{missing}</span>)}</div><div className="keyword-next-step"><b>下一步</b><span>{selected.nextStep}</span></div></div> : <div className="keyword-detail-empty">选择一个候选 ASIN 查看支持理由、缺失证据和下一步。</div>}</aside></div>
    <div className="keyword-flow-note"><b>研究边界</b><span>SellerSprite 提供真实数据；系统负责跨接口合并、硬筛选、综合评分、候选级证据和下一步建议。利润在成本数据接入前保持未接入。</span></div>
  </section>
}