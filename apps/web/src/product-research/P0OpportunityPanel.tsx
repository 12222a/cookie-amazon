import { useMemo, useState, type ReactElement } from 'react'
import {
  listSellerSpriteReviewComments,
  selectSellerSpriteProducts,
  WebSdkError,
  type SellerSpriteProductSelectionData,
} from '@cookie-amazon/web-sdk'
import {
  buildP0ProductSelectionInput,
  buildP0ReviewCommentsInput,
  decideP0Candidate,
  rankP0Candidates,
  summarizeP0Reviews,
  type P0Candidate,
  type P0ReviewSummary,
} from './p0-opportunity'
import { SELLERSPRITE_RECORDED_LEAF_CATEGORIES } from './sellersprite-category-catalog'

type CandidateReviewState = {
  status: 'queued' | 'loading' | 'complete' | 'failed'
  summary: P0ReviewSummary | null
  error: string | null
}

const formatNumber = (value: number | null | undefined): string => value == null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 1 })
const leafCategoryLabel = (item: (typeof SELLERSPRITE_RECORDED_LEAF_CATEGORIES)[number]): string => {
  const englishLabel = item.label.split(':').pop()?.trim() || item.label
  const chineseLabel = item.labelLocale?.trim()
  return chineseLabel && englishLabel && chineseLabel !== englishLabel
    ? `${englishLabel} · ${chineseLabel}`
    : chineseLabel || englishLabel
}
const errorText = (reason: unknown): string => reason instanceof WebSdkError
  ? reason.code
  : reason instanceof Error ? reason.message : 'P0_REQUEST_FAILED'

export function P0OpportunityPanel({ targetReady }: { targetReady: boolean }): ReactElement {
  const [market, setMarket] = useState('US')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selection, setSelection] = useState<SellerSpriteProductSelectionData | null>(null)
  const [candidates, setCandidates] = useState<P0Candidate[]>([])
  const [reviews, setReviews] = useState<Record<string, CandidateReviewState>>({})
  const [discovering, setDiscovering] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)

  const selectedCategory = useMemo(
    () => SELLERSPRITE_RECORDED_LEAF_CATEGORIES.find((item) => item.id === selectedCategoryId) ?? null,
    [selectedCategoryId],
  )
  const selectedCategoryPath = selectedCategory?.id ?? ''

  const discover = async (): Promise<void> => {
    if (!targetReady || selectedCategory?.children !== 0 || selectedCategoryPath === '') return
    setDiscovering(true)
    setDiscoveryError(null)
    setSelection(null)
    setCandidates([])
    setReviews({})
    try {
      const data = await selectSellerSpriteProducts(buildP0ProductSelectionInput(market, selectedCategoryPath), { timeoutMs: 20_000 })
      const ranked = rankP0Candidates(data.items)
      setSelection(data)
      setCandidates(ranked)
      setReviews(Object.fromEntries(ranked.map((candidate) => [candidate.asin, { status: 'queued', summary: null, error: null }])))

      for (const candidate of ranked) {
        setReviews((current) => ({
          ...current,
          [candidate.asin]: { status: 'loading', summary: null, error: null },
        }))
        try {
          const reviewData = await listSellerSpriteReviewComments(
            buildP0ReviewCommentsInput(candidate.asin, market),
            { timeoutMs: 20_000 },
          )
          setReviews((current) => ({
            ...current,
            [candidate.asin]: { status: 'complete', summary: summarizeP0Reviews(reviewData), error: null },
          }))
        } catch (reason: unknown) {
          setReviews((current) => ({
            ...current,
            [candidate.asin]: { status: 'failed', summary: null, error: errorText(reason) },
          }))
        }
      }
    } catch (reason: unknown) {
      setDiscoveryError(errorText(reason))
    } finally {
      setDiscovering(false)
    }
  }

  return <section className="p0-opportunity" aria-label="P0 类目机会发现">
    <div className="pr-section-heading">
      <div><span className="pr-section-index">P0</span><h3>类目机会发现</h3><span className="pr-count">自动发现 ASIN</span></div>
    </div>
    <p className="p0-intro">从已记录的 230 个末级叶子类目中选择后，按已验证的选产品合同发现候选商品；只对初筛 Top 3 串行读取评论，避免对全部 ASIN 发起昂贵请求。</p>
    <div className="p0-controls">
      <label><span>站点</span><select value={market} onChange={(event) => setMarket(event.target.value)}><option value="US">美国 · US</option></select></label>
      <label className="p0-category-select"><span>已记录末级类目（230）</span><select aria-label="已记录末级类目" value={selectedCategoryId} disabled={!targetReady} onChange={(event) => setSelectedCategoryId(event.target.value)}>
        <option value="">请选择要研究的末级类目</option>
        {SELLERSPRITE_RECORDED_LEAF_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{leafCategoryLabel(item)}</option>)}
      </select></label>
      <button type="button" className="pr-search-button" disabled={!targetReady || selectedCategory === null || discovering} onClick={() => { void discover() }}>
        {!targetReady ? '需要连接扩展' : discovering ? '发现并分析中…' : '发现候选产品 →'}
      </button>
    </div>
    {selectedCategory ? <div className="p0-contract-note">当前类目路径：<strong>{selectedCategory.labelPathLocale || selectedCategory.labelPath || selectedCategory.labelLocale || selectedCategory.label}</strong>（完整 nodeIdPath：<code>{selectedCategoryPath}</code>）；已确认是记录中的叶子类目。筛选采用抓包中的 BSR 10,000–50,000、月销量上限 300、价格上限 30、卖家数上限 1。</div> : null}
    {discoveryError ? <div className="pr-error" role="alert"><strong>候选发现失败</strong><span>{discoveryError}</span></div> : null}
    {selection ? <div className="p0-summary">接口命中 <strong>{selection.total.toLocaleString()}</strong> 个商品，本页返回 {selection.items.length} 个；评论分析仅覆盖初筛 Top {candidates.length}。</div> : null}
    {candidates.length > 0 ? <div className="p0-candidate-grid">{candidates.map((candidate, index) => {
      const review = reviews[candidate.asin]
      const decision = decideP0Candidate(candidate, review?.summary ?? null)
      return <article className="p0-candidate-card" key={candidate.asin}>
        <div className="p0-card-head"><span className="p0-tier">Top {index + 1}</span><span className={`p0-verdict is-${decision.verdict.toLowerCase()}`}>{decision.label}</span></div>
        <div className="p0-product-line">{candidate.imageUrl ? <img src={candidate.imageUrl} alt="" loading="lazy" /> : null}<div><strong>{candidate.title || candidate.asin}</strong><small>{candidate.asin} · {candidate.brand || '品牌缺失'}</small></div></div>
        <dl className="p0-metrics">
          <div><dt>初筛分</dt><dd>{candidate.discoveryScore}/95</dd></div><div><dt>月销量</dt><dd>{formatNumber(candidate.estimatedSales)}</dd></div>
          <div><dt>评论数</dt><dd>{formatNumber(candidate.reviews)}</dd></div><div><dt>近 30 天增长</dt><dd>{candidate.salesGrowth == null ? '—' : `${candidate.salesGrowth.toFixed(1)}%`}</dd></div>
          <div><dt>价格</dt><dd>{candidate.price === null ? '—' : `$${candidate.price.toFixed(2)}`}</dd></div><div><dt>卖家数</dt><dd>{formatNumber(candidate.sellers)}</dd></div>
        </dl>
        <div className="p0-review-state"><strong>评论分析</strong><span>{review?.status === 'loading' ? '读取中…' : review?.status === 'queued' ? '排队中' : review?.status === 'failed' ? `失败：${review.error}` : review?.summary ? `样本 ${review.summary.sampled}/${review.summary.total} · 低星 ${review.summary.lowStarCount} · 均星 ${review.summary.averageStar?.toFixed(2) ?? '—'}` : '等待评论'}</span></div>
        {review?.summary?.painPoints.length ? <div className="p0-pains"><strong>差异化线索</strong>{review.summary.painPoints.map((pain) => <p key={pain}>{pain}</p>)}</div> : null}
        <div className="p0-evidence"><strong>结论证据</strong>{decision.reasons.map((reason) => <p key={reason}>{reason}</p>)}<small>{decision.missing[0]}</small></div>
      </article>
    })}</div> : <div className="pr-empty"><span className="pr-empty-mark">◎</span><div><strong>等待类目候选发现</strong><p>P0 结论是“值得进一步验证的机会”，不代表可直接采购、保证盈利或可立即上架。</p></div></div>}
  </section>
}