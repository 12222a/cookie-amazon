import { useId, useMemo, useState, type ReactNode } from 'react'
import { RESEARCH_STAGE_IDS, selectStrongPainPoints, type AggregatedKeyword, type ResearchJob } from '@cookie-amazon/research-core'
import {
  EVIDENCE_TABS,
  STAGE_LABELS,
  STATUS_LABELS,
  STATUS_SYMBOLS,
  type CandidateFilter,
  type EvidenceTab,
  buildCandidateCsv,
  buildCandidateEvidenceSummary,
  buildFinalDecisionSnapshot,
  buildFinalDecisionList,
  currentReviewEvidence,
  filterResearchCandidates,
  formatResearchNumber,
  formatResearchRatio,
  executionEventLabel,
  explainExecutionMessage,
  formatEventTime,
  primaryResearchError,
  painPointEvidenceStrength,
  researchErrorExplanation,
  stageDescription,
} from './research-view-model'
import { downloadCsv } from '../csv'

type ResearchEvidenceReportProps = {
  job: ResearchJob
  onRestart: () => void
}

const EmptyEvidence = ({ children }: { children: ReactNode }) => (
  <div className="pr-auto-empty-inline"><span aria-hidden="true">○</span><p>{children}</p></div>
)

const Score = ({ label, value }: { label: string; value: number | null }) => (
  <div className="pr-auto-score">
    <div className="pr-auto-score-head"><span>{label}</span><strong>{value == null ? '—' : `${value} / 100`}</strong></div>
    <div className="pr-auto-score-bar" aria-hidden="true"><i style={{ width: `${value ?? 0}%` }} /></div>
  </div>
)

const OverviewPanel = ({ job }: { job: ResearchJob }) => {
  const decision = job.decision
  if (!decision) return <EmptyEvidence>任务没有生成综合决策，请查看执行详情中的错误与证据缺口。</EmptyEvidence>
  const groups = [
    { className: '', title: '支持当前结论', values: decision.reasons },
    { className: 'is-risk', title: '主要风险', values: decision.risks },
    { className: 'is-missing', title: '缺失信息', values: decision.missing },
  ]
  return (
    <div className="pr-auto-overview-grid">
      {groups.map((group) => (
        <article className={`pr-auto-evidence-card ${group.className}`} key={group.title}>
          <h3>{group.title}</h3>
          {group.values.length > 0
            ? <ul>{group.values.map((value) => <li key={value}>{value}</li>)}</ul>
            : <p>本次研究未记录此类信息。</p>}
        </article>
      ))}
    </div>
  )
}

const CandidatesPanel = ({ job }: { job: ResearchJob }) => {
  const [filter, setFilter] = useState<CandidateFilter>('all')
  const [selectedAsin, setSelectedAsin] = useState(job.evidence.candidates[0]?.asin ?? '')
  const filteredCandidates = useMemo(
    () => filterResearchCandidates(job.evidence.candidates, filter),
    [filter, job.evidence.candidates],
  )
  const selectedCandidate = filteredCandidates.find((candidate) => candidate.asin === selectedAsin)
    ?? filteredCandidates[0]
    ?? job.evidence.candidates[0]
  const selectedSummary = selectedCandidate ? buildCandidateEvidenceSummary(job, selectedCandidate) : null
  const fileCategory = (job.input.categoryLabel ?? job.input.categoryId).replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, '-')
  const discovery = job.stages.discovery.output as Partial<{
    requestedPages: number
    successfulPages: number
    fetchedItems: number
    uniqueCandidateCount: number
    retainedCandidates: number
    reportedTotal: number | null
    filterProfile: 'strict' | 'expanded'
    fallbackTriggered: boolean
    fallbackReason: 'empty' | 'sparse' | null
    strictUniqueCandidateCount: number
    candidateTarget: number
  }> | null
  const discoveryModeDescription = discovery?.fallbackReason === 'sparse'
    ? `严格机会筛选仅获得 ${discovery.strictUniqueCandidateCount ?? '少量'} 个有效 ASIN，已自动执行类目扩展扫描并合并去重。`
    : discovery?.fallbackReason === 'empty'
      ? '严格机会筛选为空，已自动执行类目扩展扫描。'
      : '使用严格机会筛选。'

  if (job.evidence.candidates.length === 0) return <EmptyEvidence>{discovery?.fallbackTriggered
    ? '机会筛选为空后已自动执行类目扩展扫描，但仍未发现有效 ASIN。类目路径有效；SellerSprite 当前可能没有可用商品数据。'
    : '没有获得候选商品证据。请查看候选发现阶段的请求记录和错误原因。'}</EmptyEvidence>

  const selectCandidate = (asin: string) => setSelectedAsin(asin)
  const exportCandidates = () => downloadCsv(
    `US-${fileCategory}-候选ASIN.csv`,
    buildCandidateCsv(filteredCandidates, job.candidateDecisions ?? []),
  )

  return (
    <div className="pr-auto-candidate-workspace">
      <header className="pr-auto-candidate-head">
        <div>
          <span>01 · THIS ROUND</span>
          <h3>本轮候选 ASIN <small>{filteredCandidates.length} / {job.evidence.candidates.length}</small></h3>
          <p>数据源：每轮最多读取 {discovery?.requestedPages ?? job.input.discoveryPages ?? 3} 页，实际成功请求 {discovery?.successfulPages ?? '—'} 页，累计 {discovery?.fetchedItems ?? '—'} 条，去重后 {discovery?.uniqueCandidateCount ?? '—'} 个 ASIN；{discoveryModeDescription}最终保留 {job.evidence.candidates.length} 个候选，只有 Top 3 进入深度研究。</p>
        </div>
        <div className="pr-auto-candidate-actions" aria-label="候选筛选与导出">
          {([
            ['all', '全部候选'],
            ['deep', '仅 Top 3'],
            ['high-score', '发现分 75+'],
          ] as const).map(([id, label]) => (
            <button
              aria-pressed={filter === id}
              className={filter === id ? 'is-active' : ''}
              key={id}
              onClick={() => setFilter(id)}
              type="button"
            >{label}</button>
          ))}
          <button className="is-export" disabled={filteredCandidates.length === 0} onClick={exportCandidates} type="button">导出当前 CSV ↧</button>
        </div>
      </header>

      {filteredCandidates.length === 0 ? <EmptyEvidence>当前筛选条件没有匹配候选。切换到“全部候选”可查看完整清单。</EmptyEvidence> : <>
        <div className="pr-auto-table-scroll pr-auto-candidate-table-shell">
          <table className="pr-auto-table pr-auto-candidate-table">
            <thead><tr><th>层级 / 排名</th><th>商品 / ASIN</th><th>发现分</th><th>预估月销量</th><th>价格</th><th>评分 / 评论</th><th>Listing Age</th><th>卖家数</th><th>ASIN 建议</th><th>证据状态</th></tr></thead>
            <tbody>{filteredCandidates.map((item) => {
              const summary = buildCandidateEvidenceSummary(job, item)
              const isSelected = selectedCandidate?.asin === item.asin
              return (
                <tr
                  aria-label={`选择候选 ${item.asin}`}
                  aria-selected={isSelected}
                  className={`${isSelected ? 'is-selected' : ''} ${summary.isDeepResearch ? 'is-deep' : ''}`}
                  key={item.asin}
                  onClick={() => selectCandidate(item.asin)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectCandidate(item.asin)
                    }
                  }}
                  tabIndex={0}
                >
                  <td><span className={`pr-auto-tier is-${(item.tier ?? 'c').toLowerCase()}`}>{item.tier ?? '—'}</span><small>#{summary.rank}</small></td>
                  <td>
                    <div className="pr-auto-candidate-product">
                      {item.imageUrl ? <img alt="" loading="lazy" src={item.imageUrl} /> : <span className="pr-auto-candidate-image">ASIN</span>}
                      <div><strong title={item.title}>{item.title || '未命名商品'}</strong><small>{item.brand ?? '品牌未知'}</small><a href={`https://www.amazon.com/dp/${item.asin}`} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">{item.asin} ↗</a></div>
                    </div>
                  </td>
                  <td><span className="pr-auto-candidate-score">{formatResearchNumber(item.discoveryScore)}</span></td>
                  <td>{formatResearchNumber(item.estimatedSales)}</td>
                  <td>{item.price == null ? '—' : `$${formatResearchNumber(item.price)}`}</td>
                  <td><span className="pr-auto-candidate-rating">★ {formatResearchNumber(item.rating)}</span><small>{formatResearchNumber(item.reviews)} 条</small></td>
                  <td>{item.listingAgeDays == null ? '—' : `${formatResearchNumber(item.listingAgeDays)} 天`}</td>
                  <td>{formatResearchNumber(item.sellers)}</td>
                  <td><span className={`pr-auto-priority is-${summary.priority === '重点验证' ? 'focus' : summary.priority === '待补充研究' ? 'pending' : 'defer'}`}>{summary.priority}</span><small>{summary.isDeepResearch ? 'Top 3 深度研究' : '横向对比'}</small></td>
                  <td><span className={`pr-auto-evidence-status ${summary.isDeepResearch ? 'is-complete' : 'is-pending'}`}>{summary.tags.filter((tag) => tag.state === 'available').length} / {summary.tags.length} 已采集</span></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
        <div className="pr-auto-candidate-foot"><span>点击或按 Enter 选择商品并查看对应证据。</span><span>CSV 只导出当前筛选结果，包含 UTF-8 BOM 和稳定列头。</span></div>

        {selectedSummary && <section className="pr-auto-candidate-detail" aria-live="polite">
          <article className="pr-auto-candidate-evidence">
            <header>
              <div><span>TRACEABLE EVIDENCE</span><h3>候选证据摘要</h3></div>
              <strong>{selectedSummary.tags.filter((tag) => tag.state === 'available').length} / {selectedSummary.tags.length} 项有证据</strong>
            </header>
            <div className="pr-auto-evidence-tag-list">
              {selectedSummary.tags.map((tag) => <span className={`is-${tag.state}`} key={tag.label}>{tag.label}</span>)}
            </div>
            {selectedSummary.isDeepResearch ? <div className="pr-auto-selected-signals">
              <article><span>反查关键词</span><strong>{formatResearchNumber(selectedSummary.reverseKeywordCount)}</strong><small>仅统计来源包含当前 ASIN 的反查词。</small></article>
              <article><span>评论样本</span><strong>{formatResearchNumber(selectedSummary.reviewSampleCount)}</strong><small>低星评论 {formatResearchNumber(selectedSummary.lowStarReviewCount)} 条。</small></article>
              <article><span>高频低星痛点</span><strong>{formatResearchNumber(selectedSummary.painPoints.length)}</strong><small>{selectedSummary.painPoints.map((pain) => pain.label).join('、') || '尚未形成稳定主题'}</small></article>
            </div> : <p className="pr-auto-comparison-note">该商品保留为横向对比候选，当前流程不会为其调用关键词反查和评论深研接口；这不代表相关证据为零。</p>}
          </article>

          <aside className="pr-auto-selected-candidate">
            <header><div><span>SELECTED ASIN · #{selectedSummary.rank}</span><h3>{selectedSummary.candidate.title}</h3><a href={`https://www.amazon.com/dp/${selectedSummary.candidate.asin}`} rel="noreferrer" target="_blank">{selectedSummary.candidate.asin} ↗</a></div><b>{selectedSummary.priority}</b></header>
            <dl>
              <div><dt>发现分</dt><dd>{formatResearchNumber(selectedSummary.candidate.discoveryScore)}</dd></div>
              <div><dt>预估月销量</dt><dd>{formatResearchNumber(selectedSummary.candidate.estimatedSales)}</dd></div>
              <div><dt>价格</dt><dd>{selectedSummary.candidate.price == null ? '—' : `$${formatResearchNumber(selectedSummary.candidate.price)}`}</dd></div>
              <div><dt>评分</dt><dd>{formatResearchNumber(selectedSummary.candidate.rating)}</dd></div>
              <div><dt>评论数</dt><dd>{formatResearchNumber(selectedSummary.candidate.reviews)}</dd></div>
              <div><dt>Listing Age</dt><dd>{selectedSummary.candidate.listingAgeDays == null ? '—' : `${formatResearchNumber(selectedSummary.candidate.listingAgeDays)} 天`}</dd></div>
            </dl>
            <div className="pr-auto-candidate-direction"><strong>下一步建议</strong><span>{selectedSummary.nextStep}</span></div>
          </aside>
        </section>}
      </>}
    </div>
  )
}

const uniqueKeywords = (job: ResearchJob): Array<AggregatedKeyword & { sourceLabel: string }> => {
  const byNormalized = new Map<string, AggregatedKeyword & { sourceLabel: string }>()
  for (const item of job.evidence.reverseKeywords) byNormalized.set(item.normalized, { ...item, sourceLabel: 'ASIN 反查' })
  for (const item of job.evidence.minedKeywords) {
    const existing = byNormalized.get(item.normalized)
    byNormalized.set(item.normalized, { ...item, sourceLabel: existing ? '反查 + 扩词' : '关键词挖掘' })
  }
  return [...byNormalized.values()].sort((left, right) => right.score - left.score)
}

const KeywordsPanel = ({ job }: { job: ResearchJob }) => {
  const keywords = useMemo(() => uniqueKeywords(job), [job])
  const seedSet = useMemo(() => new Set(job.evidence.seedKeywords.map((item) => item.normalized)), [job])
  const abaByKeyword = useMemo(() => new Map(job.evidence.aba.map((item) => [item.keyword.trim().toLowerCase(), item])), [job])
  if (keywords.length === 0) return <EmptyEvidence>没有获得关键词证据，ABA 与市场阶段可能因此被跳过。</EmptyEvidence>
  return (
    <div className="pr-auto-table-scroll">
      <table className="pr-auto-table">
        <thead><tr><th>关键词</th><th>类型</th><th>综合分</th><th>来源</th><th>来源 ASIN</th><th>搜索量</th><th>购买率</th><th>供需比</th><th>ABA 排名</th></tr></thead>
        <tbody>{keywords.map((item) => {
          const aba = abaByKeyword.get(item.normalized)
          return (
            <tr key={item.normalized}>
              <td><strong>{item.keyword}</strong>{seedSet.has(item.normalized) && <span className="pr-auto-seed">种子词</span>}</td>
              <td><span className="pr-auto-keyword-kind">{item.kind}</span></td>
              <td>{formatResearchNumber(item.score)}</td>
              <td>{item.sourceLabel}</td>
              <td>{item.sourceCount}</td>
              <td>{formatResearchNumber(aba?.searches ?? item.searchVolume)}</td>
              <td>{formatResearchRatio(aba?.purchaseRate ?? item.purchaseRate)}</td>
              <td>{formatResearchNumber(item.supplyDemandRatio)}</td>
              <td>{aba?.searchRank == null ? '—' : `#${formatResearchNumber(aba.searchRank)}`}</td>
            </tr>
          )
        })}</tbody>
      </table>
    </div>
  )
}

const MarketPanel = ({ job }: { job: ResearchJob }) => {
  const marketRows = job.evidence.markets.flatMap((item) => [
    ['品牌集中度', item.brandConcentration, item.keyword],
    ['卖家集中度', item.sellerConcentration, item.keyword],
    ['新品占比', item.newProductShare, item.keyword],
    ['Amazon 自营占比', item.amzRatio, item.keyword],
  ] as const)
  const competitorRows = job.evidence.competitors.flatMap((item) => [
    ['Top 10 销量集中度', item.top10SalesConcentration, item.keyword],
    ['新品占比（竞品样本）', item.newListingShare, item.keyword],
  ] as const)
  const rows = [...marketRows, ...competitorRows]
  if (rows.length === 0) return <EmptyEvidence>没有获得代表词市场结构证据。</EmptyEvidence>
  return (
    <div className="pr-auto-market-grid">
      {rows.map(([label, value, keyword], index) => (
        <article className="pr-auto-metric-card" key={`${keyword}-${label}-${index}`}>
          <header><span>{label}</span><strong>{formatResearchRatio(value)}</strong></header>
          <div className="pr-auto-threshold" aria-hidden="true"><i style={{ left: `${Math.max(0, Math.min(100, (value ?? 0) * 100))}%` }} /></div>
          <small>{keyword} · {value == null ? '上游没有返回该指标' : '指标越高代表该维度越集中或占比越高'}</small>
        </article>
      ))}
      {job.evidence.competitors.map((item) => (
        <article className="pr-auto-metric-card" key={`${item.keyword}-barrier`}>
          <header><span>评论壁垒中位数</span><strong>{formatResearchNumber(item.medianReviews)}</strong></header>
          <p>{item.keyword} · 样本 {formatResearchNumber(item.productCount)} 个商品 · Listing Age 中位数 {item.medianListingAgeDays == null ? '—' : `${formatResearchNumber(item.medianListingAgeDays)} 天`}</p>
        </article>
      ))}
    </div>
  )
}

const ReviewsPanel = ({ job }: { job: ResearchJob }) => {
  const reviews = currentReviewEvidence(job)
  const painPoints = selectStrongPainPoints(reviews)
  if (painPoints.length === 0) return <EmptyEvidence>本次分析了 {reviews.sampled} 条评论，其中低星评论 {reviews.lowStarCount} 条，但去重后未形成稳定的高频低星痛点。</EmptyEvidence>
  return (
    <div className="pr-auto-pain-list">
      <p className="pr-auto-panel-summary">评论样本 {reviews.sampled} 条，其中低星评论 {reviews.lowStarCount} 条；形成 {painPoints.length} 个可验证的高频低星痛点。</p>
      {painPoints.map((pain) => (
        <article className="pr-auto-pain" key={pain.id}>
          <div><h3>{pain.label}</h3><small>{pain.count} 条主题命中 · 其中 {pain.lowStarCount ?? Math.round(pain.count * pain.lowStarShare)} 条低星 · {pain.asinCount} 个 ASIN · 低星占比 {formatResearchRatio(pain.lowStarShare)}</small></div>
          <div>
            {pain.excerpts.length > 0 ? <blockquote>{pain.excerpts.slice(0, 3).map((excerpt) => <p key={excerpt}>低星原文：“{excerpt}”</p>)}</blockquote> : <p>没有可展示的低星评论摘录。</p>}
            <strong>建议验证：{pain.direction}</strong>
            <small>平均评分 {formatResearchNumber(pain.averageStar)} · 变体 {pain.variations.length > 0 ? pain.variations.join('、') : '—'}</small>
          </div>
        </article>
      ))}
    </div>
  )
}

const ExecutionPanel = ({ job }: { job: ResearchJob }) => (
  <div className="pr-auto-execution-list">
    {(Object.keys(job.stages) as Array<keyof typeof job.stages>).map((stageId) => {
      const stage = job.stages[stageId]
      const duration = stage.startedAt != null && stage.completedAt != null ? `${Math.max(0, stage.completedAt - stage.startedAt)} ms` : '—'
      const skipReason = stage.status === 'skipped' && stage.output && typeof stage.output === 'object' && 'reason' in stage.output
        ? explainExecutionMessage(String((stage.output as { reason: unknown }).reason))
        : null
      return (
        <details className="pr-auto-execution-stage" key={stageId} open={stage.status === 'failed' || stage.status === 'partial'}>
          <summary className="pr-auto-execution-row">
            <strong>{STAGE_LABELS[stageId]}</strong>
            <span className={`is-${stage.status}`}>{STATUS_LABELS[stage.status]}</span>
            <p>{skipReason ?? stageDescription(job, stageId)}</p>
            <b>{stage.calls} 次</b>
            <small>{duration}</small>
          </summary>
          <div className="pr-auto-execution-events">
            {stage.events.length > 0 ? stage.events.map((event, index) => (
              <div className={`pr-auto-log-row is-${event.type}`} key={`${event.at}-${event.operation}-${index}`}>
                <time>{formatEventTime(event.at)}</time>
                <b>{executionEventLabel(event)}</b>
                <span><strong>{event.operation}{event.target ? ` · ${event.target}` : ''}</strong><small>{explainExecutionMessage(event.message)}</small></span>
              </div>
            )) : <p className="pr-auto-log-empty">该阶段没有执行记录。</p>}
            {stage.errors.map((error, index) => {
              const explanation = researchErrorExplanation(error)
              return <div className="pr-auto-error-detail" key={`${error.kind}-${index}`}><code>{error.message}</code><p>{explanation.reason}</p><small>建议：{explanation.action}</small></div>
            })}
          </div>
        </details>
      )
    })}
    {job.errors.length > 0 && <div className="pr-auto-job-errors" role="alert"><strong>任务错误</strong>{job.errors.map((error) => <p key={error}>{error}</p>)}</div>}
  </div>
)

export const ResearchEvidenceReport = ({ job, onRestart }: ResearchEvidenceReportProps) => {
  const [activeTab, setActiveTab] = useState<EvidenceTab>('overview')
  const tabIdPrefix = useId()
  const decision = job.decision
  const noCandidateOutcome = job.stages.discovery.status === 'complete' && job.evidence.candidates.length === 0
  const discoveryOutput = job.stages.discovery.output as Partial<{ fallbackTriggered: boolean }> | null
  const degradedStages = (Object.keys(job.stages) as Array<keyof typeof job.stages>)
    .filter((stageId) => {
      const status = job.stages[stageId].status
      if (status === 'partial' || status === 'failed') return true
      return status === 'skipped' && !noCandidateOutcome
    })
  const primaryError = primaryResearchError(job)
  const primaryExplanation = primaryError ? researchErrorExplanation(primaryError.error) : null
  const snapshot = buildFinalDecisionSnapshot(job)
  const finalDecisionList = buildFinalDecisionList(job)
  const topCandidateDecision = finalDecisionList[0]
  const title = primaryError && primaryExplanation
    ? `${STAGE_LABELS[primaryError.stageId]}失败：${primaryExplanation.reason}`
    : noCandidateOutcome
      ? discoveryOutput?.fallbackTriggered
        ? '已完成两档类目扫描，本轮仍未发现可用 ASIN 候选'
        : '已完成类目扫描，本轮未发现可用 ASIN 候选'
      : degradedStages.length > 0
        ? '部分证据未返回，请优先补充对应 ASIN 的研究阶段'
        : finalDecisionList.length > 0
          ? '每个 ASIN 独立判断，不对整个类目下结论'
          : '本轮没有生成可用的 ASIN 候选'

  return (
    <>
      <section className="pr-auto-completed-stages" id="stages" aria-label="研究阶段">
        {RESEARCH_STAGE_IDS.map((stageId) => {
          const stage = job.stages[stageId]
          const stageCount = stage.total > 0 ? `${stage.completed} / ${stage.total}` : stage.status === 'complete' ? '完成' : STATUS_LABELS[stage.status]
          return <button className={`pr-auto-completed-stage is-${stage.status}`} key={stageId} onClick={() => setActiveTab('execution')} type="button"><span>{STATUS_SYMBOLS[stage.status]}</span><strong>{STAGE_LABELS[stageId]}</strong><small>{stageCount} · {STATUS_LABELS[stage.status]}</small></button>
        })}
      </section>
      <section className="pr-auto-report-grid" aria-live="polite">
      <article className={`pr-auto-card pr-auto-decision is-${topCandidateDecision?.priority === '重点验证' ? 'focus' : topCandidateDecision?.priority === '待补充研究' ? 'pending' : 'defer'}`}>
        <span className="pr-auto-kicker">CANDIDATE RESEARCH RESULTS</span>
        <div className="pr-auto-decision-label">本轮 ASIN 候选结果</div>
        <h3>{title}</h3>
        <p>{noCandidateOutcome
          ? discoveryOutput?.fallbackTriggered
            ? '完整叶子类目路径已被正常接受。系统先执行机会筛选，空结果后自动移除销量、价格、BSR 和卖家数上限再扫描；两档均无有效 ASIN，因此后续按 ASIN 研究阶段无需执行。'
            : '完整叶子类目路径已被正常接受，但本轮没有返回有效 ASIN，因此后续按 ASIN 研究阶段无需执行。'
          : primaryError || degradedStages.length > 0
            ? topCandidateDecision?.nextStep ?? decision?.boundary ?? '请查看执行详情，确认失败阶段和错误原因。'
            : '本次只反映研究时间点发现的具体商品。Top 3 已进入深度研究；其余候选保留在池中，待后续补充证据。类目新品需要在下一轮运行时重新发现。'}</p>
        <div className="pr-auto-decision-meta">
          <span>候选级证据独立记录</span>
          <span>{job.status === 'partial' ? '任务部分完成' : job.status === 'failed' ? '任务失败' : '任务完成'}</span>
          <span>{job.input.market} · {job.input.categoryLabel ?? job.input.categoryId}</span>
          <span>{job.evidence.candidates.length} 个候选 / {filterResearchCandidates(job.evidence.candidates, 'deep').length} 个深度研究</span>
          <span>{job.completedAt == null ? '完成时间 —' : `完成于 ${new Date(job.completedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}</span>
        </div>
        <section className="pr-auto-qualified-asins" aria-label="本轮 ASIN 研究清单">
          <header>
            <div><span>RESEARCHED ASINS</span><strong>按发现分排序，逐个显示 ASIN 级判断</strong></div>
            <small>共 {finalDecisionList.length} 个</small>
          </header>
          {finalDecisionList.length > 0 ? <div className="pr-auto-qualified-asin-list">
            {finalDecisionList.map((item) => {
              const priorityClass = item.priority === '重点验证' ? 'focus' : item.priority === '待补充研究' ? 'pending' : 'defer'
              return (
                <article className={`is-${priorityClass}`} key={item.asin}>
                  <div className="pr-auto-qualified-asin-main">
                    <strong>{item.asin}</strong>
                    <span>排名 #{item.rank} · 发现分 {formatResearchNumber(item.candidate.discoveryScore)} · 可信度 {item.scores.confidence}%</span>
                  </div>
                  <span className={`pr-auto-priority is-${priorityClass}`}>{item.priority}</span>
                  <p>{item.nextStep}</p>
                </article>
              )
            })}
          </div> : <p className="pr-auto-qualified-empty">{noCandidateOutcome
            ? '本轮没有获得有效 ASIN。候选发现已经正常完成，这不代表类目路径格式错误。'
            : '本轮没有获得真实 ASIN 候选，请先查看候选发现阶段的请求记录和错误原因。'}</p>}
        </section>
        <section className="pr-auto-decision-pains" aria-label="高频低星痛点摘要">
          <header>
            <div><span>REVIEW SIGNALS</span><strong>具体是哪几个痛点</strong></div>
            <button type="button" onClick={() => setActiveTab('reviews')}>查看评论摘录与痛点详情 →</button>
          </header>
          {snapshot.painPoints.length > 0 ? <div className="pr-auto-decision-pain-list">
            {snapshot.painPoints.map((pain, index) => (
              <article key={pain.id}>
                <b>0{index + 1}</b>
                <div>
                  <h4>{pain.label}</h4>
                  <p>{pain.count} 条主题命中 · 其中 {pain.lowStarCount ?? Math.round(pain.count * pain.lowStarShare)} 条低星 · 涉及 {pain.asinCount} 个 ASIN · 低星占比 {formatResearchRatio(pain.lowStarShare)} · 证据强度 {painPointEvidenceStrength(pain)} · 平均 {formatResearchNumber(pain.averageStar)} 星</p>
                  {pain.excerpts.length > 0 ? <div className="pr-auto-decision-excerpts">
                    <span>代表性低星评论原文（仅 1–3 星）</span>
                    <blockquote>{pain.excerpts.slice(0, 2).map((excerpt) => <p key={excerpt}>“{excerpt}”</p>)}</blockquote>
                  </div> : <small className="pr-auto-decision-no-excerpt">该主题有计数证据，但上游未保留可展示的评论原文。</small>}
                  <strong>建议验证：{pain.direction}</strong>
                </div>
              </article>
            ))}
          </div> : <p className="pr-auto-decision-empty">本次评论样本尚未形成稳定的高频低星主题。</p>}
        </section>
        <section className="pr-auto-decision-metrics" aria-label="关键研究数据">
          <header><span>KEY METRICS</span><strong>本次决策依据的重要数据</strong></header>
          <div>
            {snapshot.metrics.map((metric) => (
              <article key={metric.id}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </article>
            ))}
          </div>
        </section>
        {degradedStages.length > 0 && <div className="pr-auto-result-warning" role="alert">
          <strong>{primaryError ? `首个根因：${STAGE_LABELS[primaryError.stageId]}` : '这不是一次完整成功的研究'}</strong>
          {primaryError && primaryExplanation
            ? <><code>{primaryError.error.message}</code><p>{primaryExplanation.reason} 建议：{primaryExplanation.action}</p></>
            : <p>{degradedStages.map((stageId) => `${STAGE_LABELS[stageId]}：${STATUS_LABELS[job.stages[stageId].status]}`).join('；')}</p>}
          <button type="button" onClick={() => setActiveTab('execution')}>查看请求记录、错误原因和建议 →</button>
        </div>}
        <button className="pr-auto-secondary" type="button" onClick={onRestart}>重新运行研究</button>
      </article>
      <aside className="pr-auto-card pr-auto-score-card" aria-label="四维研究评分">
        <h3>候选筛选维度</h3>
        <Score label="需求质量 Demand" value={topCandidateDecision?.scores.demand ?? null} />
        <Score label="进入条件 Entry" value={topCandidateDecision?.scores.entry ?? null} />
        <Score label="差异化空间" value={topCandidateDecision?.scores.differentiation ?? null} />
        <Score label="证据可信度" value={topCandidateDecision?.scores.confidence ?? null} />
      </aside>
      <section className="pr-auto-card pr-auto-report-candidates" id="candidates" aria-labelledby={`${tabIdPrefix}-candidate-title`}>
        <header className="pr-auto-report-candidate-head">
          <div><span className="pr-auto-kicker">CANDIDATE RESEARCH RESULTS</span><h3 id={`${tabIdPrefix}-candidate-title`}>本轮 ASIN 候选</h3><p>按发现分和预估月销量排序；Top 3 进入深度研究，其余候选保留用于横向对比。</p></div>
          <span className="pr-auto-report-candidate-count">{job.evidence.candidates.length} 个候选</span>
        </header>
        <CandidatesPanel job={job} />
      </section>

      <section className="pr-auto-card pr-auto-evidence-shell" id="evidence">
        <div className="pr-auto-evidence-tabs" role="tablist" aria-label="研究证据">
          {EVIDENCE_TABS.map((tab) => (
            <button
              id={`${tabIdPrefix}-tab-${tab.id}`}
              aria-controls={`${tabIdPrefix}-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'is-active' : ''}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >{tab.label}</button>
          ))}
        </div>
        <div
          aria-labelledby={`${tabIdPrefix}-tab-${activeTab}`}
          className="pr-auto-evidence-content"
          id={`${tabIdPrefix}-panel-${activeTab}`}
          role="tabpanel"
          tabIndex={0}
        >
          {activeTab === 'overview' && <OverviewPanel job={job} />}
          {activeTab === 'candidates' && <CandidatesPanel job={job} />}
          {activeTab === 'keywords' && <KeywordsPanel job={job} />}
          {activeTab === 'market' && <MarketPanel job={job} />}
          {activeTab === 'reviews' && <ReviewsPanel job={job} />}
          {activeTab === 'execution' && <ExecutionPanel job={job} />}
        </div>
      </section>
      {decision?.boundary && <p className="pr-auto-boundary">{decision.boundary}</p>}
    </section>
    </>
  )
}