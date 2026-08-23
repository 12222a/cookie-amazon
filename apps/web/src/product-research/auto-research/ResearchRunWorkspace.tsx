import { useEffect, useMemo, useState } from 'react'
import { RESEARCH_STAGE_IDS, type ResearchJob, type ResearchStageId } from '@cookie-amazon/research-core'
import {
  STAGE_LABELS,
  STATUS_LABELS,
  STATUS_SYMBOLS,
  stageDescription,
  stageImpact,
  sumBudget,
} from './research-view-model'

type ResearchRunWorkspaceProps = {
  job: ResearchJob
  progress: { stage: ResearchStageId | null; completed: number; total: number }
  onCancel: () => void
}

const stageClassName = (job: ResearchJob, stageId: ResearchStageId, selectedStage: ResearchStageId): string => {
  const status = job.stages[stageId].status
  return [
    'pr-auto-stage',
    `is-${status}`,
    selectedStage === stageId ? 'is-selected' : '',
  ].filter(Boolean).join(' ')
}

export const ResearchRunWorkspace = ({ job, progress, onCancel }: ResearchRunWorkspaceProps) => {
  const initialStage = job.currentStage ?? RESEARCH_STAGE_IDS.find((stageId) => job.stages[stageId].status === 'running') ?? 'discovery'
  const [selectedStage, setSelectedStage] = useState<ResearchStageId>(initialStage)
  useEffect(() => {
    if (job.currentStage) setSelectedStage(job.currentStage)
  }, [job.currentStage])

  const current = job.stages[selectedStage]
  const usedCalls = sumBudget(job.usedBudget)
  const maximumCalls = sumBudget(job.budget)
  const completeStages = RESEARCH_STAGE_IDS.filter((stageId) => ['complete', 'partial', 'skipped'].includes(job.stages[stageId].status)).length
  const failedStages = RESEARCH_STAGE_IDS.filter((stageId) => ['partial', 'failed'].includes(job.stages[stageId].status)).length
  const overallPercent = Math.round((completeStages / RESEARCH_STAGE_IDS.length) * 100)
  const stagePercent = current.total > 0 ? Math.round((current.completed / current.total) * 100) : current.status === 'complete' ? 100 : 0
  const currentImpact = stageImpact(job, selectedStage)
  const evidenceCount = useMemo(() => (
    job.evidence.candidates.length
      + job.evidence.reverseKeywords.length
      + job.evidence.minedKeywords.length
      + job.evidence.aba.length
      + job.evidence.competitors.length
      + job.evidence.markets.length
      + job.evidence.reviews.painPoints.length
  ), [job.evidence])

  return (
    <section className="pr-auto-run-layout" aria-live="polite">
      <aside className="pr-auto-card pr-auto-stage-rail">
        <h3>研究阶段</h3>
        <div className="pr-auto-stages">
          {RESEARCH_STAGE_IDS.map((stageId, index) => {
            const stage = job.stages[stageId]
            return (
              <button
                aria-current={job.currentStage === stageId ? 'step' : undefined}
                className={stageClassName(job, stageId, selectedStage)}
                key={stageId}
                onClick={() => setSelectedStage(stageId)}
                type="button"
              >
                <span className="pr-auto-stage-icon" aria-hidden="true">{stage.status === 'idle' ? String(index + 1).padStart(2, '0') : STATUS_SYMBOLS[stage.status]}</span>
                <span><strong>{STAGE_LABELS[stageId]}</strong><small>{stage.total > 0 ? `${stage.completed}/${stage.total} · ` : ''}{STATUS_LABELS[stage.status]}</small></span>
              </button>
            )
          })}
        </div>
      </aside>

      <article className="pr-auto-card pr-auto-stage-detail">
        <header>
          <div><span className="pr-auto-kicker">STAGE {String(RESEARCH_STAGE_IDS.indexOf(selectedStage) + 1).padStart(2, '0')} / 07</span><h3>{STAGE_LABELS[selectedStage]}</h3><p>{stageDescription(job, selectedStage)}</p></div>
          {current.status === 'running' && <i className="pr-auto-running-dot" aria-label="正在运行" />}
        </header>
        <div className="pr-auto-progress-track" aria-label={`阶段进度 ${stagePercent}%`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stagePercent}><i style={{ width: `${stagePercent}%` }} /></div>
        <dl className="pr-auto-stage-metrics">
          <div><dt>状态</dt><dd className={`is-${current.status}`}>{STATUS_LABELS[current.status]}</dd></div>
          <div><dt>项目进度</dt><dd>{current.total > 0 ? `${current.completed} / ${current.total}` : '—'}</dd></div>
          <div><dt>远端调用</dt><dd>{current.calls} 次</dd></div>
          <div><dt>证据累计</dt><dd>{evidenceCount} 条</dd></div>
        </dl>
        {currentImpact && <div className={`pr-auto-signal is-${current.status}`}><strong>对最终结论的影响</strong><p>{currentImpact}</p></div>}
        {current.errors.length > 0 && (
          <div className="pr-auto-stage-errors" role="alert">
            <strong>阶段错误</strong>
            {current.errors.map((error, index) => <p key={`${error.kind}-${index}`}>{error.message} · {error.retryable ? '可重试' : '不可重试'}</p>)}
          </div>
        )}
        {current.status === 'running' && <p className="pr-auto-running-note">任务会保留每个阶段已经获得的证据。单项失败不会清空其他结果。</p>}
      </article>

      <aside className="pr-auto-card pr-auto-run-summary">
        <h3>任务摘要</h3>
        <div className="pr-auto-overall-progress" style={{ '--progress': `${overallPercent}%` } as React.CSSProperties} aria-label={`总进度 ${overallPercent}%`}><span>{overallPercent}%</span></div>
        <dl>
          <div><dt>已完成阶段</dt><dd>{completeStages} / 7</dd></div>
          <div><dt>当前阶段</dt><dd>{progress.stage ? STAGE_LABELS[progress.stage] : '收尾中'}</dd></div>
          <div><dt>当前项目</dt><dd>{progress.total > 0 ? `${progress.completed} / ${progress.total}` : '—'}</dd></div>
          <div><dt>远端调用</dt><dd>{usedCalls} / {maximumCalls}</dd></div>
          <div><dt>局部失败</dt><dd>{failedStages}</dd></div>
        </dl>
        <details className="pr-auto-budget-details">
          <summary>调用预算明细</summary>
          {Object.entries(job.budget).map(([key, limit]) => <div key={key}><span>{key}</span><strong>{job.usedBudget[key as keyof typeof job.usedBudget]} / {limit}</strong></div>)}
        </details>
        <button className="pr-auto-ghost" onClick={onCancel} type="button">取消任务</button>
      </aside>
    </section>
  )
}