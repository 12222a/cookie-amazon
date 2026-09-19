import {
  analyzeReviews,
  selectStrongPainPoints,
  type CandidateResearchDecision,
  type CandidateResearchPriority,
  type ProductCandidate,
  type ResearchJob,
  type ResearchStageError,
  type ResearchStageEvent,
  type ResearchStageId,
  type ResearchStageStatus,
  type ReviewEvidence,
  type ReviewPainPoint,
} from '@cookie-amazon/research-core'

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

export type CandidateFilter = 'all' | 'deep' | 'high-score'

export type CandidateEvidenceSummary = {
  candidate: ProductCandidate
  rank: number
  isDeepResearch: boolean
  priority: CandidateResearchPriority
  nextStep: string
  reverseKeywordCount: number
  reviewSampleCount: number
  lowStarReviewCount: number
  painPoints: ReviewPainPoint[]
  tags: Array<{ label: string; state: 'available' | 'missing' | 'comparison' }>
}

const csvCell = (value: string | number | null | undefined): string => {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const isDeepResearchCandidate = (candidate: ProductCandidate): boolean => candidate.researchDepth == null
  ? candidate.tier === 'A' || candidate.tier === 'B'
  : candidate.researchDepth === 'deep'

export const filterResearchCandidates = (
  candidates: readonly ProductCandidate[],
  filter: CandidateFilter,
): ProductCandidate[] => candidates.filter((candidate) => {
  if (filter === 'deep') return isDeepResearchCandidate(candidate)
  if (filter === 'high-score') return candidate.discoveryScore >= 75
  return true
})

const candidateDecisionFor = (
  decisions: readonly CandidateResearchDecision[],
  candidate: ProductCandidate,
): CandidateResearchDecision | null => decisions.find((item) => item.asin === candidate.asin) ?? null

const jobCandidatePriority = (decisions: readonly CandidateResearchDecision[], candidate: ProductCandidate): string =>
  candidateDecisionFor(decisions, candidate)?.priority ?? (isDeepResearchCandidate(candidate) ? '待补充研究' : '暂不优先')

const jobCandidateNextStep = (decisions: readonly CandidateResearchDecision[], candidate: ProductCandidate): string =>
  candidateDecisionFor(decisions, candidate)?.nextStep ?? (isDeepResearchCandidate(candidate) ? 'Top 3 深度研究；补充当前 ASIN 的需求、市场和评论证据。' : '保留为横向对比候选。')

export const buildCandidateCsv = (candidates: readonly ProductCandidate[], decisions: readonly CandidateResearchDecision[] = []): string => {
  const headers = [
    '排名', '层级', 'ASIN', '商品标题', '品牌', '发现分', '预估月销量', '价格(USD)',
    '评分', '评论数', 'Listing Age(天)', '卖家数', '研究优先级', '下一步建议',
  ]
  const rows = candidates.map((candidate, index) => [
    index + 1,
    candidate.tier ?? '',
    candidate.asin,
    candidate.title,
    candidate.brand ?? '',
    candidate.discoveryScore,
    candidate.estimatedSales,
    candidate.price,
    candidate.rating,
    candidate.reviews,
    candidate.listingAgeDays,
    candidate.sellers,
    jobCandidatePriority(decisions, candidate),
    jobCandidateNextStep(decisions, candidate),
  ])
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
}

export const buildCandidateEvidenceSummary = (
  job: ResearchJob,
  candidate: ProductCandidate,
): CandidateEvidenceSummary => {
  const rank = Math.max(0, job.evidence.candidates.findIndex((item) => item.asin === candidate.asin)) + 1
  const isDeepResearch = isDeepResearchCandidate(candidate)
  const reverseKeywordCount = job.evidence.reverseKeywords.filter((keyword) => keyword.sourceAsins.includes(candidate.asin)).length
  const candidateReviewItems = (job.evidence.reviewItems ?? []).filter((review) => review.asin === candidate.asin)
  const reviews = analyzeReviews(candidateReviewItems)
  const painPoints = selectStrongPainPoints(reviews)
  const hasKeywordDemand = job.evidence.aba.length > 0 || job.evidence.minedKeywords.length > 0
  const hasMarket = job.evidence.competitors.length > 0 || job.evidence.markets.length > 0

  const candidateDecision = (job.candidateDecisions ?? []).find((item) => item.asin === candidate.asin)
  const priority = candidateDecision?.priority ?? (isDeepResearch ? '待补充研究' : '暂不优先')
  const nextStep = candidateDecision?.nextStep ?? (isDeepResearch ? '补充当前 ASIN 的需求、市场和评论证据。' : '保留为横向对比候选。')

  return {
    candidate,
    rank,
    isDeepResearch,
    priority,
    nextStep,
    reverseKeywordCount,
    reviewSampleCount: reviews.sampled,
    lowStarReviewCount: reviews.lowStarCount,
    painPoints,
    tags: [
      { label: '类目发现', state: 'available' },
      { label: `ASIN 反查${reverseKeywordCount > 0 ? ` ${reverseKeywordCount}` : ''}`, state: reverseKeywordCount > 0 ? 'available' : isDeepResearch ? 'missing' : 'comparison' },
      { label: '关键词需求', state: isDeepResearch ? hasKeywordDemand ? 'available' : 'missing' : 'comparison' },
      { label: '市场壁垒', state: isDeepResearch ? hasMarket ? 'available' : 'missing' : 'comparison' },
      { label: `评论证据${reviews.sampled > 0 ? ` ${reviews.sampled}` : ''}`, state: reviews.sampled > 0 ? 'available' : isDeepResearch ? 'missing' : 'comparison' },
    ],
  }
}

type PainPoint = ResearchJob['evidence']['reviews']['painPoints'][number]

export const painPointEvidenceStrength = (pain: PainPoint): '强' | '中' | '初步' => {
  const lowStarCount = pain.lowStarCount ?? Math.round(pain.count * pain.lowStarShare)
  if (lowStarCount >= 5 && pain.asinCount >= 2 && pain.lowStarShare >= 0.7) return '强'
  if (lowStarCount >= 3 && pain.asinCount >= 2 && pain.lowStarShare >= 0.6) return '中'
  return '初步'
}

export type FinalDecisionMetric = {
  id: 'candidate' | 'keyword' | 'price' | 'barrier' | 'reviews' | 'market' | 'coverage'
  label: string
  value: string
  detail: string
}

export type FinalDecisionSnapshot = {
  painPoints: ResearchJob['evidence']['reviews']['painPoints']
  metrics: FinalDecisionMetric[]
}

export type FinalDecisionListItem = CandidateResearchDecision & {
  candidate: ProductCandidate
  rank: number
}

export const buildFinalDecisionList = (job: ResearchJob): FinalDecisionListItem[] => {
  const decisions = job.candidateDecisions ?? []
  return job.evidence.candidates
    .map((candidate, index) => {
      const decision = candidateDecisionFor(decisions, candidate)
      const fallbackPriority: CandidateResearchPriority = isDeepResearchCandidate(candidate) ? '待补充研究' : '暂不优先'
      const resolvedDecision: CandidateResearchDecision = decision ?? {
        asin: candidate.asin,
        priority: fallbackPriority,
        nextStep: fallbackPriority === '待补充研究'
          ? 'Top 3 深度研究；补充当前 ASIN 的需求、市场和评论证据。'
          : '保留为横向对比候选；当前轮次不调用深度研究接口。',
        reasons: [],
        missing: ['当前任务没有生成该 ASIN 的独立研究决策'],
        scores: { demand: null, entry: null, differentiation: null, confidence: 0 },
      }
      return {
        ...resolvedDecision,
        candidate,
        rank: index + 1,
      }
    })
}

const available = (value: number | null | undefined, suffix = ''): string => value == null
  ? '暂无数据'
  : `${formatResearchNumber(value)}${suffix}`

const availableRatio = (value: number | null | undefined): string => value == null
  ? '暂无数据'
  : formatResearchRatio(value)

export const currentReviewEvidence = (job: ResearchJob): ReviewEvidence => job.evidence.reviewItems?.length > 0
  ? analyzeReviews(job.evidence.reviewItems)
  : job.evidence.reviews

export const buildFinalDecisionSnapshot = (job: ResearchJob): FinalDecisionSnapshot => {
  const topCandidate = [...job.evidence.candidates]
    .sort((left, right) => right.discoveryScore - left.discoveryScore)[0]
  const keyword = [...job.evidence.aba]
    .sort((left, right) => (right.searches ?? -1) - (left.searches ?? -1))[0]
  const keywordFallback = [...job.evidence.reverseKeywords, ...job.evidence.minedKeywords]
    .sort((left, right) => right.score - left.score)[0]
  const competitor = [...job.evidence.competitors]
    .sort((left, right) => right.productCount - left.productCount)[0]
  const market = job.evidence.markets.find((item) => [
    item.brandConcentration, item.sellerConcentration, item.newProductShare,
  ].some((value) => value != null)) ?? job.evidence.markets[0]
  const keywordName = keyword?.keyword ?? keywordFallback?.keyword
  const searches = keyword?.searches ?? keywordFallback?.searchVolume
  const purchaseRate = keyword?.purchaseRate ?? keywordFallback?.purchaseRate
  const keywordProducts = keyword?.products ?? keywordFallback?.products
  const reviews = currentReviewEvidence(job)
  const strongPainPoints = selectStrongPainPoints(reviews)
  const pricedCandidates = job.evidence.candidates
    .filter((item) => item.price != null)
    .sort((left, right) => (left.price ?? 0) - (right.price ?? 0))
  const medianPrice = pricedCandidates.length === 0
    ? null
    : pricedCandidates.length % 2 === 1
      ? pricedCandidates[Math.floor(pricedCandidates.length / 2)]?.price ?? null
      : ((pricedCandidates[pricedCandidates.length / 2 - 1]?.price ?? 0) + (pricedCandidates[pricedCandidates.length / 2]?.price ?? 0)) / 2
  const minPrice = pricedCandidates[0]?.price ?? null
  const maxPrice = pricedCandidates.at(-1)?.price ?? null
  const stages = job.stages ? Object.values(job.stages) : []
  const completedStages = stages.filter((stage) => stage.status === 'complete').length
  const hasMarketMetrics = job.evidence.markets.some((item) => [
    item.totalProducts, item.totalSales, item.fbaRatio, item.amzRatio, item.fbmRatio,
    item.brandConcentration, item.sellerConcentration, item.newProductShare,
  ].some((value) => value != null))
  const evidenceCoverage = [
    job.evidence.candidates.length > 0,
    job.evidence.reverseKeywords.length + job.evidence.minedKeywords.length > 0,
    job.evidence.aba.length > 0,
    job.evidence.competitors.length > 0,
    hasMarketMetrics,
    reviews.sampled > 0,
  ]
  const coveredEvidenceGroups = evidenceCoverage.filter(Boolean).length
  const missingEvidence = [
    job.evidence.candidates.length === 0 ? '候选商品' : null,
    job.evidence.reverseKeywords.length + job.evidence.minedKeywords.length === 0 ? '关键词' : null,
    job.evidence.aba.length === 0 ? 'ABA 需求' : null,
    job.evidence.competitors.length === 0 ? '竞品门槛' : null,
    !hasMarketMetrics ? '市场结构' : null,
    reviews.sampled === 0 ? '评论样本' : null,
  ].filter((item): item is string => item != null)

  return {
    painPoints: strongPainPoints,
    metrics: [
      {
        id: 'candidate',
        label: '候选商品',
        value: job.evidence.candidates.length > 0 ? `${job.evidence.candidates.length} 个` : '暂无数据',
        detail: topCandidate
          ? `优先样本 ${topCandidate.asin} · 价格 ${topCandidate.price == null ? '暂无数据' : `$${formatResearchNumber(topCandidate.price)}`} · 预估销量 ${available(topCandidate.estimatedSales)} · 评分 ${available(topCandidate.rating)} · 评论 ${available(topCandidate.reviews)}`
          : '候选发现阶段没有返回有效商品。',
      },
      {
        id: 'keyword',
        label: '代表关键词 / 需求',
        value: keywordName ?? '暂无数据',
        detail: keywordName
          ? `搜索量 ${available(searches)} · 购买率 ${availableRatio(purchaseRate)} · 商品数 ${available(keywordProducts)}`
          : 'ASIN 反查、扩词和 ABA 阶段均没有形成代表关键词。',
      },
      {
        id: 'price',
        label: '价格带',
        value: medianPrice == null ? '暂无数据' : `$${formatResearchNumber(medianPrice)} 中位数`,
        detail: medianPrice == null
          ? '候选商品没有返回可用价格。'
          : `有效价格样本 ${pricedCandidates.length} / ${job.evidence.candidates.length} 个 · 区间 $${formatResearchNumber(minPrice)}–$${formatResearchNumber(maxPrice)}${topCandidate?.price == null ? '' : ` · 优先样本 $${formatResearchNumber(topCandidate.price)}`}`,
      },
      {
        id: 'barrier',
        label: '竞品进入门槛',
        value: competitor?.medianReviews == null ? '暂无数据' : `${formatResearchNumber(competitor.medianReviews)} 条评论`,
        detail: competitor
          ? `${competitor.keyword} · 样本 ${formatResearchNumber(competitor.productCount)} 个商品 · Listing Age 中位数 ${available(competitor.medianListingAgeDays, ' 天')} · Top 10 销量集中度 ${availableRatio(competitor.top10SalesConcentration)}`
          : '竞品阶段没有返回可计算的门槛数据。',
      },
      {
        id: 'reviews',
        label: '低星评论证据',
        value: reviews.sampled > 0 ? `${reviews.lowStarCount} / ${reviews.sampled} 条` : '暂无数据',
        detail: reviews.sampled > 0
          ? `低星样本占比 ${formatResearchRatio(reviews.lowStarCount / reviews.sampled)} · 识别 ${reviews.painPoints.length} 个候选主题 · 其中 ${strongPainPoints.length} 个达到高频低星门槛`
          : '评论分析阶段没有获得可用样本。',
      },
      {
        id: 'market',
        label: '市场集中度',
        value: market?.brandConcentration != null
          ? `品牌 ${formatResearchRatio(market.brandConcentration)}`
          : market?.sellerConcentration != null
            ? `卖家 ${formatResearchRatio(market.sellerConcentration)}`
            : '暂无数据',
        detail: market
          ? `${market.keyword} · 卖家集中度 ${availableRatio(market.sellerConcentration)} · 新品占比 ${availableRatio(market.newProductShare)} · 总商品 ${available(market.totalProducts)}`
          : '市场研究没有返回可计算的集中度数据。',
      },
      {
        id: 'coverage',
        label: '数据覆盖与完整度',
        value: stages.length > 0
          ? `${completedStages} / ${stages.length} 阶段完整`
          : `${coveredEvidenceGroups} / ${evidenceCoverage.length} 类证据`,
        detail: `证据覆盖 ${coveredEvidenceGroups} / ${evidenceCoverage.length} 类 · 候选 ${job.evidence.candidates.length} · 反查/扩词 ${job.evidence.reverseKeywords.length + job.evidence.minedKeywords.length} · ABA ${job.evidence.aba.length} · 竞品 ${job.evidence.competitors.length} · 市场 ${job.evidence.markets.length} · 评论 ${reviews.sampled}${missingEvidence.length > 0 ? ` · 缺失：${missingEvidence.join('、')}` : ' · 关键证据类型均有数据'}`,
      },
    ],
  }
}

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
    case 'reviewAnalysis': {
      const reviews = currentReviewEvidence(job)
      return `已分析 ${reviews.sampled} 条评论，识别 ${reviews.painPoints.length} 个痛点主题。`
    }
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