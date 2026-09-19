import { useMemo, useState } from 'react'
import { DEFAULT_RESEARCH_POLICY, RESEARCH_STAGE_IDS, type DiscoveryPageCount } from '@cookie-amazon/research-core'
import { ResearchEvidenceReport } from './ResearchEvidenceReport'
import { ResearchRunWorkspace } from './ResearchRunWorkspace'
import { sumBudget } from './research-view-model'
import { useAutoResearch } from './use-auto-research'
import { SELLERSPRITE_RECORDED_LEAF_CATEGORIES } from '../sellersprite-category-catalog'

type LeafCategory = (typeof SELLERSPRITE_RECORDED_LEAF_CATEGORIES)[number]

const categoryPath = (item: LeafCategory): string =>
  item.labelPathLocale || item.labelPath || item.labelLocale || item.label

export const categoryOptionLabel = (item: LeafCategory): string => {
  const englishPath = item.label.split(':').map((part) => part.trim()).filter(Boolean).join(' > ')
  const localizedPath = categoryPath(item).split(':').map((part) => part.trim()).filter(Boolean).join(' > ')
  return localizedPath && localizedPath !== englishPath ? `${localizedPath} · ${englishPath}` : localizedPath || englishPath
}

export const filterLeafCategories = (categories: readonly LeafCategory[], query: string): LeafCategory[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (normalizedQuery.length === 0) return [...categories]
  return categories.filter((item) => [
    item.label,
    item.labelLocale,
    item.labelPath,
    item.labelPathLocale,
    item.id,
  ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
}

type AutoResearchPanelProps = {
  targetReady: boolean
  hidden?: boolean
}

const DISCOVERY_PAGE_OPTIONS: readonly DiscoveryPageCount[] = [1, 3, 5]
const DISCOVERY_PAGE_SIZE = 60

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
          : '系统只使用经过白名单清洗的业务证据。单项失败时保留已有结果继续运行，证据不足的 ASIN 会标记为“待补充研究”。'}</p>
      {errors.length > 0 && <div className="pr-auto-empty-errors" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
      {!cancelled && !starting && errors.length === 0 && <div className="pr-auto-flow-preview">{RESEARCH_STAGE_IDS.map((stageId) => <span key={stageId}>{stageId === 'discovery' ? '候选发现' : stageId === 'reverseKeywords' ? 'ASIN 反查' : stageId === 'keywordMining' ? '关键词挖掘' : stageId === 'abaValidation' ? 'ABA 验证' : stageId === 'marketStructure' ? '市场结构' : stageId === 'reviewAnalysis' ? '差评分析' : '综合决策'}</span>)}</div>}
    </div>
  </section>
)

export const AutoResearchPanel = ({ targetReady, hidden = false }: AutoResearchPanelProps) => {
  const { job, running, error, start: run, cancel } = useAutoResearch()
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [discoveryPages, setDiscoveryPages] = useState<DiscoveryPageCount>(3)

  const selectedCategory = useMemo(
    () => SELLERSPRITE_RECORDED_LEAF_CATEGORIES.find((item) => item.id === selectedCategoryId),
    [selectedCategoryId],
  )
  const matchingCategories = useMemo(
    () => filterLeafCategories(SELLERSPRITE_RECORDED_LEAF_CATEGORIES, categorySearch),
    [categorySearch],
  )
  const visibleCategories = useMemo(
    () => selectedCategory && !matchingCategories.some((item) => item.id === selectedCategory.id)
      ? [selectedCategory, ...matchingCategories]
      : matchingCategories,
    [matchingCategories, selectedCategory],
  )
  const selectedCategoryPath = selectedCategory?.id ?? ''
  const canStart = targetReady && !running && selectedCategory?.children === 0 && selectedCategoryPath.length > 0
  const totalBudget = sumBudget(DEFAULT_RESEARCH_POLICY.budget)
    + discoveryPages * 2
    - DEFAULT_RESEARCH_POLICY.budget.discovery
  const maximumSourceItems = discoveryPages * DISCOVERY_PAGE_SIZE
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
    if (!canStart || !selectedCategory) return
    void run({
      market: 'US',
      categoryId: selectedCategoryPath,
      categoryLabel: selectedCategory.labelPathLocale || selectedCategory.labelPath || selectedCategory.labelLocale || selectedCategory.label,
      discoveryPages,
    })
  }

  return (
    <main className="pr-auto-workbench" hidden={hidden} id="auto-research-panel" role="tabpanel" aria-labelledby="pr-auto-mode-tab">
      <section className="pr-auto-card pr-auto-setup-card">
        <header className="pr-auto-section-head">
          <div><span className="pr-auto-kicker">NEW RESEARCH</span><h2>研究条件</h2><p>直接选择美国站最细叶子类目，获取当前时间点的候选 ASIN 快照；新品将在下一轮研究中重新发现。</p></div>
          <span className={`pr-auto-live-badge ${targetReady ? 'is-ready' : 'is-blocked'}`} role="status">{targetReady ? '● 数据通道可用' : '○ 数据通道未就绪'}</span>
        </header>
        <div className="pr-auto-setup-grid">
          <label><span>站点</span><select aria-label="研究站点" disabled value="US"><option value="US">美国 · US</option></select></label>
          <label className="pr-auto-category-field"><span>末级叶子类目（230）</span><div className="pr-auto-category-controls"><input aria-label="搜索末级叶子类目" autoComplete="off" disabled={running || !targetReady} placeholder="搜索中英文名称或完整路径" type="search" value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} /><select aria-label="末级叶子类目" disabled={running || !targetReady} value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}><option value="">请选择末级叶子类目</option>{visibleCategories.map((item) => <option key={item.id} value={item.id}>{categoryOptionLabel(item)}</option>)}</select></div></label>
          <label><span>候选数据范围</span><select aria-label="候选数据范围" disabled={running || !targetReady} value={discoveryPages} onChange={(event) => {
            const pages = Number(event.target.value)
            if (pages === 1 || pages === 3 || pages === 5) setDiscoveryPages(pages)
          }}>{DISCOVERY_PAGE_OPTIONS.map((pages) => <option key={pages} value={pages}>{pages === 1 ? '快速扫描' : pages === 3 ? '标准扫描' : '深度扫描'} · {pages} 页 / 最多 {pages * DISCOVERY_PAGE_SIZE} 条</option>)}</select></label>
          <button className="pr-auto-primary" disabled={!canStart} onClick={start} type="button">{actionLabel}</button>
        </div>
        {categorySearch.trim() && <p className="pr-auto-category-search-state" role="status">{matchingCategories.length > 0 ? `找到 ${matchingCategories.length} 个匹配类目；列表使用完整路径区分同名叶子类目。` : '没有匹配的类目；当前已选类目会保留，清空搜索可恢复完整列表。'}</p>}
        {!canStart && !running && <p className="pr-auto-start-hint">{!targetReady ? '请先恢复 SellerSprite 数据连接。' : !selectedCategory ? '请选择一个末级叶子类目。' : ''}</p>}
        {selectedCategory && <p className="pr-auto-selected-path">已选叶子类目：{selectedCategory.label.split(':').pop()?.trim() || selectedCategory.label} · {selectedCategory.labelLocale || selectedCategory.label}<br />完整路径：{selectedCategory.labelPathLocale || selectedCategory.labelPath || selectedCategory.label}</p>}
        {error && <div className="pr-auto-config-error" role="alert">任务启动失败：{error}</div>}
        <div className="pr-auto-setup-note">
          <span>候选数据源 <b>每轮最多 {discoveryPages} 页 / {maximumSourceItems} 条</b></span>
          <span>严格候选不足 {DEFAULT_RESEARCH_POLICY.candidateLimits.comparison} 个时 <b>自动扩展扫描并合并去重</b></span>
          <span>深度候选 <b>Top {DEFAULT_RESEARCH_POLICY.candidateLimits.deep} ASIN</b></span>
          <span>全部符合条件的 ASIN <b>排序、去重后完整输出</b></span>
          <span>ABA 高价值词 <b>{DEFAULT_RESEARCH_POLICY.abaKeywordLimit} 个</b></span>
          <span>最大远端调用 <b>{totalBudget} 次</b></span>
        </div>
      </section>

      {running && job && <ResearchRunWorkspace job={job} progress={progress} onCancel={cancel} />}
      {running && !job && <ResearchEmptyState starting />}
      {!running && job && job.status !== 'cancelled' && <ResearchEvidenceReport job={job} onRestart={start} />}
      {!running && !job && <ResearchEmptyState errors={error ? [error] : []} />}
      {!running && job?.status === 'cancelled' && <ResearchEmptyState cancelled errors={job.errors} />}
    </main>
  )
}