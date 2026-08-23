import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_RESEARCH_POLICY, RESEARCH_STAGE_IDS } from '@cookie-amazon/research-core'
import {
  listSellerSpriteCategoryNodes,
  WebSdkError,
  type SellerSpriteCategoryNode,
} from '@cookie-amazon/web-sdk'
import { ResearchEvidenceReport } from './ResearchEvidenceReport'
import { ResearchRunWorkspace } from './ResearchRunWorkspace'
import { sumBudget } from './research-view-model'
import { useAutoResearch } from './use-auto-research'

type AutoResearchPanelProps = {
  targetReady: boolean
  hidden?: boolean
}

const ResearchEmptyState = ({ cancelled = false, starting = false, errors = [] }: { cancelled?: boolean; starting?: boolean; errors?: string[] }) => (
  <section className="pr-auto-card pr-auto-empty-state" aria-live="polite" aria-busy={starting || undefined}>
    <div>
      <span className="pr-auto-empty-symbol" aria-hidden="true">{starting ? '⋯' : '◎'}</span>
      <h3>{starting ? '正在创建自动研究任务' : cancelled ? '任务已取消，已有进度已保留' : errors.length > 0 ? '本次任务没有生成可用结论' : '准备开始一次自动产品研究'}</h3>
      <p>{starting
        ? '系统正在初始化阶段状态和调用预算，首个候选发现进度即将显示。'
        : cancelled
        ? '系统已停止后续外部调用。你可以调整类目后重新运行，也可以直接重试当前条件。'
        : errors.length > 0
          ? '请检查错误信息和 SellerSprite 连接状态，然后重新运行。'
          : '系统只使用经过白名单清洗的业务证据。单项失败时保留已有结果继续运行，关键证据不足时默认给出“观察”。'}</p>
      {errors.length > 0 && <div className="pr-auto-empty-errors" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
      {!cancelled && !starting && errors.length === 0 && <div className="pr-auto-flow-preview">{RESEARCH_STAGE_IDS.map((stageId) => <span key={stageId}>{stageId === 'discovery' ? '候选发现' : stageId === 'reverseKeywords' ? 'ASIN 反查' : stageId === 'keywordMining' ? '关键词挖掘' : stageId === 'abaValidation' ? 'ABA 验证' : stageId === 'marketStructure' ? '市场结构' : stageId === 'reviewAnalysis' ? '差评分析' : '综合决策'}</span>)}</div>}
    </div>
  </section>
)

export const AutoResearchPanel = ({ targetReady, hidden = false }: AutoResearchPanelProps) => {
  const { job, running, error, start: run, cancel } = useAutoResearch()
  const [categoryOptions, setCategoryOptions] = useState<SellerSpriteCategoryNode[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [categoryStatus, setCategoryStatus] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [categoryError, setCategoryError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!targetReady) {
      setCategoryOptions([])
      setSelectedCategoryId('')
      setCategoryStatus('idle')
      setCategoryError(null)
      return () => { active = false }
    }
    setCategoryStatus('loading')
    setCategoryError(null)
    void listSellerSpriteCategoryNodes({ marketld: 1, table: 'bsr_sales_nearly' }, { timeoutMs: 15_000 })
      .then((data) => {
        if (!active) return
        setCategoryOptions(data.items)
        setSelectedCategoryId((current) => data.items.some((item) => item.id === current) ? current : data.items[0]?.id ?? '')
        setCategoryStatus('idle')
      })
      .catch((reason: unknown) => {
        if (!active) return
        setCategoryStatus('failed')
        setCategoryError(reason instanceof WebSdkError ? reason.code : reason instanceof Error ? reason.message : 'CATEGORY_LOAD_FAILED')
      })
    return () => { active = false }
  }, [targetReady])

  const selectedCategory = useMemo(() => categoryOptions.find((item) => item.id === selectedCategoryId), [categoryOptions, selectedCategoryId])
  const canStart = targetReady && !running && Boolean(selectedCategoryId)
  const totalBudget = sumBudget(DEFAULT_RESEARCH_POLICY.budget)
  const progress = {
    stage: job?.currentStage ?? null,
    completed: job?.currentStage ? job.stages[job.currentStage].completed : 0,
    total: job?.currentStage ? job.stages[job.currentStage].total : 0,
  }
  const actionLabel = running
    ? '研究运行中…'
    : job && job.status !== 'cancelled'
      ? '重新运行研究 →'
      : '开始自动研究 →'

  const start = () => {
    if (!canStart) return
    void run({
      market: 'US',
      categoryId: selectedCategoryId,
      categoryLabel: selectedCategory?.labelLocale || selectedCategory?.label || selectedCategoryId,
    })
  }

  return (
    <main className="pr-auto-workbench" hidden={hidden} id="auto-research-panel" role="tabpanel" aria-labelledby="pr-auto-mode-tab">
      <section className="pr-auto-card pr-auto-setup-card">
        <header className="pr-auto-section-head">
          <div><span className="pr-auto-kicker">NEW RESEARCH</span><h2>研究条件</h2><p>自动模式不需要预先输入关键词，系统会从类目候选中自动建立词池。</p></div>
          <span className={`pr-auto-live-badge ${targetReady ? 'is-ready' : 'is-blocked'}`} role="status">{targetReady ? '● 数据通道可用' : '○ 数据通道未就绪'}</span>
        </header>
        <div className="pr-auto-setup-grid">
          <label><span>站点</span><select aria-label="研究站点" disabled value="US"><option value="US">美国 · US</option></select></label>
          <label><span>一级类目</span><select aria-label="一级类目" disabled={running || categoryStatus === 'loading' || categoryOptions.length === 0} value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}><option value="">{categoryStatus === 'loading' ? '加载类目中…' : '请选择一级类目'}</option>{categoryOptions.map((item) => <option key={item.id} value={item.id}>{item.labelLocale || item.label} · {item.id}</option>)}</select></label>
          <button className="pr-auto-primary" disabled={!canStart} onClick={start} type="button">{actionLabel}</button>
        </div>
        {!canStart && !running && <p className="pr-auto-start-hint">{!targetReady ? '请先恢复 SellerSprite 数据连接。' : categoryStatus === 'loading' ? '正在读取一级类目。' : !selectedCategoryId ? '请选择一级类目后开始研究。' : ''}</p>}
        {categoryError && <div className="pr-auto-config-error" role="alert">类目加载失败：{categoryError}</div>}
        {error && <div className="pr-auto-config-error" role="alert">任务启动失败：{error}</div>}
        <details className="pr-auto-advanced">
          <summary>高级设置与调用预算</summary>
          <div className="pr-auto-advanced-grid">
            <div><span>深度候选</span><strong>Top {DEFAULT_RESEARCH_POLICY.candidateLimits.deep} ASIN</strong></div>
            <div><span>对比候选上限</span><strong>{DEFAULT_RESEARCH_POLICY.candidateLimits.comparison} 个</strong></div>
            <div><span>ABA 高价值词上限</span><strong>{DEFAULT_RESEARCH_POLICY.abaKeywordLimit} 个</strong></div>
            <div><span>最大远端调用</span><strong>{totalBudget} 次</strong></div>
          </div>
          <p>预算由研究策略统一管理；达到上限的调用会被跳过，并在执行详情中保留原因。</p>
        </details>
      </section>

      {running && job && <ResearchRunWorkspace job={job} progress={progress} onCancel={cancel} />}
      {running && !job && <ResearchEmptyState starting />}
      {!running && job?.decision && <ResearchEvidenceReport job={job} onRestart={start} />}
      {!running && !job && <ResearchEmptyState />}
      {!running && job?.status === 'cancelled' && <ResearchEmptyState cancelled errors={job.errors} />}
      {!running && job && job.status !== 'cancelled' && !job.decision && <ResearchEmptyState errors={job.errors.length > 0 ? job.errors : ['关键阶段未生成足够证据，请查看连接状态后重试。']} />}
    </main>
  )
}