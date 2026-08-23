import { useId, useMemo, useState, type ReactNode } from 'react'
import type { AggregatedKeyword, ResearchJob } from '@cookie-amazon/research-core'
import {
  EVIDENCE_TABS,
  STAGE_LABELS,
  STATUS_LABELS,
  type EvidenceTab,
  formatResearchNumber,
  formatResearchRatio,
  executionEventLabel,
  explainExecutionMessage,
  formatEventTime,
  primaryResearchError,
  researchErrorExplanation,
  stageDescription,
} from './research-view-model'

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
  if (job.evidence.candidates.length === 0) return <EmptyEvidence>没有获得候选商品证据。</EmptyEvidence>
  return (
    <div className="pr-auto-table-scroll">
      <table className="pr-auto-table">
        <thead><tr><th>层级</th><th>商品 / ASIN</th><th>发现分</th><th>预估销量</th><th>价格</th><th>评分</th><th>评论数</th><th>Listing Age</th><th>卖家数</th></tr></thead>
        <tbody>{job.evidence.candidates.map((item) => (
          <tr key={item.asin}>
            <td><span className="pr-auto-tier">{item.tier ?? '—'}</span></td>
            <td><strong>{item.title || '未命名商品'}</strong><small>{item.asin}</small></td>
            <td>{formatResearchNumber(item.discoveryScore)}</td>
            <td>{formatResearchNumber(item.estimatedSales)}</td>
            <td>{item.price == null ? '—' : `$${formatResearchNumber(item.price)}`}</td>
            <td>{formatResearchNumber(item.rating)}</td>
            <td>{formatResearchNumber(item.reviews)}</td>
            <td>{item.listingAgeDays == null ? '—' : `${formatResearchNumber(item.listingAgeDays)} 天`}</td>
            <td>{formatResearchNumber(item.sellers)}</td>
          </tr>
        ))}</tbody>
      </table>
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
  const reviews = job.evidence.reviews
  if (reviews.painPoints.length === 0) return <EmptyEvidence>本次分析了 {reviews.sampled} 条评论，但未形成稳定的差评痛点主题。</EmptyEvidence>
  return (
    <div className="pr-auto-pain-list">
      <p className="pr-auto-panel-summary">评论样本 {reviews.sampled} 条，其中低星评论 {reviews.lowStarCount} 条。</p>
      {reviews.painPoints.map((pain) => (
        <article className="pr-auto-pain" key={pain.id}>
          <div><h3>{pain.label}</h3><small>{pain.count} 条 · {pain.asinCount} 个 ASIN · 低星占比 {formatResearchRatio(pain.lowStarShare)}</small></div>
          <div>
            {pain.excerpts.length > 0 ? <blockquote>{pain.excerpts.slice(0, 3).map((excerpt) => <p key={excerpt}>“{excerpt}”</p>)}</blockquote> : <p>没有可展示的评论摘录。</p>}
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
  const degradedStages = (Object.keys(job.stages) as Array<keyof typeof job.stages>)
    .filter((stageId) => ['partial', 'failed', 'skipped'].includes(job.stages[stageId].status))
  const primaryError = primaryResearchError(job)
  const primaryExplanation = primaryError ? researchErrorExplanation(primaryError.error) : null
  const title = primaryError && primaryExplanation
    ? `${STAGE_LABELS[primaryError.stageId]}失败：${primaryExplanation.reason}`
    : degradedStages.length > 0
      ? `${degradedStages.length} 个阶段存在执行缺口，当前结论仅供参考`
      : decision?.reasons[0] ?? (decision ? `本次研究建议“${decision.label}”` : '本次任务未生成可用结论')

  return (
    <section className="pr-auto-report-grid" aria-live="polite">
      <article className={`pr-auto-card pr-auto-decision is-${decision?.verdict.toLowerCase() ?? 'failed'}`}>
        <span className="pr-auto-kicker">FINAL DECISION</span>
        <div className="pr-auto-decision-label">{decision ? decision.label : '结论不可用'}</div>
        <h3>{title}</h3>
        <p>{decision?.reasons.slice(1).join('；') || decision?.boundary || '请查看执行详情，确认失败阶段和错误原因。'}</p>
        <div className="pr-auto-decision-meta">
          <span>可信度 {decision ? `${decision.scores.confidence}%` : '—'}</span>
          <span>{job.status === 'partial' ? '任务部分完成' : job.status === 'failed' ? '任务失败' : '任务完成'}</span>
          <span>{job.input.market} · {job.input.categoryLabel ?? job.input.categoryId}</span>
          <span>{job.completedAt == null ? '完成时间 —' : `完成于 ${new Date(job.completedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}</span>
        </div>
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
        <h3>四维研究评分</h3>
        <Score label="需求质量 Demand" value={decision?.scores.demand ?? null} />
        <Score label="进入条件 Entry" value={decision?.scores.entry ?? null} />
        <Score label="差异化空间" value={decision?.scores.differentiation ?? null} />
        <Score label="证据可信度" value={decision?.scores.confidence ?? null} />
      </aside>

      <section className="pr-auto-card pr-auto-evidence-shell">
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
  )
}