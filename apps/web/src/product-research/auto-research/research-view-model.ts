import type { ResearchJob, ResearchStageError, ResearchStageEvent, ResearchStageId, ResearchStageStatus } from '@cookie-amazon/research-core'

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

const SKIP_REASON_LABELS: Record<string, string> = {
  'remote-capabilities-blocked': '前序请求返回登录、权限或数据合同错误，为避免连续失败，后续远端阶段已停止。',
  'no-candidates': '候选发现没有返回有效 ASIN，后续依赖商品的阶段无法运行。',
  'capability-unavailable': '当前扩展或数据通道未提供此项能力。',
  'no-seed-keywords': 'ASIN 反查没有形成可用种子词，关键词挖掘无法启动。',
  'no-keywords': '没有形成可验证的关键词池，ABA 验证无法启动。',
  'no-representative-keywords': '没有可用于竞品与市场分析的代表词。',
  'pipeline-stopped-after-unexpected-error': '前序阶段发生未预期错误，流水线已安全停止。',
}

export const explainExecutionMessage = (message: string): string => SKIP_REASON_LABELS[message] ?? message

export const primaryResearchError = (job: ResearchJob): { stageId: ResearchStageId; error: ResearchStageError } | null => {
  for (const stageId of Object.keys(STAGE_LABELS) as ResearchStageId[]) {
    const error = job.stages[stageId].errors.find((item) => item.fatal) ?? job.stages[stageId].errors[0]
    if (error) return { stageId, error }
  }
  return null
}

export const researchErrorExplanation = (error: ResearchStageError): { reason: string; action: string } => {
  const code = error.message
  if (/TARGET_NOT_LOGGED_IN/.test(code)) return { reason: 'SellerSprite 登录会话已失效或尚未登录。', action: '打开 SellerSprite 确认登录后重新运行。' }
  if (/EXTENSION_UNAVAILABLE|NETWORK/.test(code)) return { reason: '网页与扩展的数据通道中断。', action: '重新加载扩展和当前页面，再检查数据通道状态。' }
  if (/TIMEOUT/.test(code)) return { reason: '上游请求在限定时间内没有完成。', action: '保持 SellerSprite 页面打开后重试；若持续发生，减少本次调用量。' }
  if (/RATE_LIMIT|429/.test(code)) return { reason: '上游接口触发频率限制。', action: '稍候再试，已获得的阶段证据会保留。' }
  if (/TARGET_RESPONSE_INVALID|INVALID_MESSAGE|UNSUPPORTED_PROTOCOL/.test(code)) return { reason: '上游真实响应与当前解析合同不一致。', action: '保留该错误码并更新扩展解析器，重复运行无法自行恢复。' }
  if (/REQUEST_ABORTED/.test(code)) return { reason: '请求已被取消。', action: '需要时重新运行任务。' }
  if (error.kind === 'authentication') return { reason: '数据源身份验证失败。', action: '确认 SellerSprite 登录状态后重试。' }
  if (error.kind === 'permission') return { reason: '当前账号或扩展缺少调用权限。', action: '检查 SellerSprite 套餐和扩展授权。' }
  if (error.kind === 'contract') return { reason: '数据响应结构无法安全解析。', action: '需要更新解析合同后再运行。' }
  if (error.kind === 'network') return { reason: '网络或扩展通信失败。', action: '恢复连接后重试该任务。' }
  return { reason: '该调用未能完成。', action: error.retryable ? '可以直接重新运行。' : '请根据错误码检查数据源状态。' }
}

export const executionEventLabel = (event: ResearchStageEvent): string => ({
  stage: '阶段', request: '请求', response: '响应', error: '错误', skip: '跳过',
})[event.type]

export const formatEventTime = (timestamp: number): string => new Date(timestamp).toLocaleTimeString('zh-CN', {
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

export type EvidenceTab = 'overview' | 'candidates' | 'keywords' | 'market' | 'reviews' | 'execution'

export const EVIDENCE_TABS: ReadonlyArray<{ id: EvidenceTab; label: string }> = [
  { id: 'overview', label: '研究概览' },
  { id: 'candidates', label: '候选商品' },
  { id: 'keywords', label: '关键词' },
  { id: 'market', label: '市场结构' },
  { id: 'reviews', label: '差评痛点' },
  { id: 'execution', label: '执行详情' },
]