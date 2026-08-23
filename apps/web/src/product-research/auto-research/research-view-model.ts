import type { ResearchJob, ResearchStageId, ResearchStageStatus } from '@cookie-amazon/research-core'

export const STAGE_LABELS: Record<ResearchStageId, string> = {
  discovery: '候选发现',
  reverseKeywords: 'ASIN 反查',
  keywordMining: '关键词挖掘',
  abaValidation: 'ABA 验证',
  marketStructure: '竞品与市场',
  reviewAnalysis: '差评分析',
  decision: '综合决策',
}

export const STATUS_LABELS: Record<ResearchStageStatus, string> = {
  idle: '等待',
  running: '进行中',
  complete: '成功',
  partial: '部分成功',
  skipped: '已跳过',
  failed: '失败',
  cancelled: '已取消',
}

export const STATUS_SYMBOLS: Record<ResearchStageStatus, string> = {
  idle: '○',
  running: '●',
  complete: '✓',
  partial: '!',
  skipped: '—',
  failed: '×',
  cancelled: '×',
}

export const formatResearchNumber = (value: number | null | undefined): string => value == null
  ? '—'
  : value.toLocaleString('en-US', { maximumFractionDigits: 1 })

export const formatResearchRatio = (value: number | null | undefined): string => value == null
  ? '—'
  : `${Math.round(value * 100)}%`

export const stageDescription = (job: ResearchJob, stageId: ResearchStageId): string => {
  const evidence = job.evidence
  switch (stageId) {
    case 'discovery':
      return `已识别 ${evidence.candidates.length} 个有效候选，Top 3 将进入深度研究。`
    case 'reverseKeywords':
      return `已聚合 ${evidence.reverseKeywords.length} 个反查词，并选择 ${evidence.seedKeywords.length} 个种子词。`
    case 'keywordMining':
      return `已获得 ${evidence.minedKeywords.length} 个扩展词；失败时继续使用反查词池。`
    case 'abaValidation':
      return `已获得 ${evidence.aba.length} 条 ABA 搜索和购买行为证据。`
    case 'marketStructure':
      return `已获得 ${evidence.competitors.length} 条竞品证据和 ${evidence.markets.length} 条市场证据。`
    case 'reviewAnalysis':
      return `已分析 ${evidence.reviews.sampled} 条评论，识别 ${evidence.reviews.painPoints.length} 个痛点主题。`
    case 'decision':
      return job.decision ? `综合结论：${job.decision.label}，可信度 ${job.decision.scores.confidence}。` : '正在汇总需求、进入条件、差异化和证据可信度。'
  }
}

export const stageImpact = (job: ResearchJob, stageId: ResearchStageId): string | null => {
  const stage = job.stages[stageId]
  if (stage.status === 'partial') return '该阶段仅获得部分证据，最终可信度已相应降低。'
  if (stage.status === 'skipped') return '该能力未参与本次任务，最终结论会明确标记证据缺口。'
  if (stage.status === 'failed') return '该阶段没有获得有效证据，已保留其他阶段结果。'
  if (stage.status === 'cancelled') return '任务已取消，后续外部调用不会继续执行。'
  return null
}

export const sumBudget = (values: Record<string, number>): number => Object.values(values)
  .reduce((sum, value) => sum + value, 0)

export type EvidenceTab = 'overview' | 'candidates' | 'keywords' | 'market' | 'reviews' | 'execution'

export const EVIDENCE_TABS: ReadonlyArray<{ id: EvidenceTab; label: string }> = [
  { id: 'overview', label: '研究概览' },
  { id: 'candidates', label: '候选商品' },
  { id: 'keywords', label: '关键词' },
  { id: 'market', label: '市场结构' },
  { id: 'reviews', label: '差评痛点' },
  { id: 'execution', label: '执行详情' },
]