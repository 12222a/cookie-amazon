import { createBudgetTracker } from './budget'
import { createDecision } from './decision'
import { aggregateKeywords, selectAbaKeywords, selectRepresentativeKeywords, selectSeedKeywords } from './keywords'
import type {
  AbaPeriod,
  CandidateTier,
  KeywordMetric,
  ProductCandidate,
  ResearchBudgetKey,
  ResearchFailureKind,
  ResearchInput,
  ResearchJob,
  ResearchPortError,
  ResearchStageError,
  ResearchStageId,
  ResearchStageState,
  ResearchStageStatus,
  ReviewItem,
} from './model'
import { DEFAULT_RESEARCH_POLICY } from './policy'
import type { ResearchPipelineOptions, ResearchPorts } from './ports'
import { analyzeReviews } from './reviews'

const STAGES: readonly ResearchStageId[] = [
  'discovery', 'reverseKeywords', 'keywordMining', 'abaValidation',
  'marketStructure', 'reviewAnalysis', 'decision',
]

const createStage = (id: ResearchStageId): ResearchStageState => ({
  id,
  status: 'idle',
  completed: 0,
  total: 0,
  calls: 0,
  startedAt: null,
  completedAt: null,
  input: null,
  output: null,
  errors: [],
  events: [],
})

const createStages = (): Record<ResearchStageId, ResearchStageState> => Object.fromEntries(
  STAGES.map((stage) => [stage, createStage(stage)]),
) as Record<ResearchStageId, ResearchStageState>

const errorKind = (error: unknown): ResearchFailureKind => {
  const kind = typeof error === 'object' && error !== null && 'kind' in error ? (error as ResearchPortError).kind : null
  return kind && ['authentication', 'permission', 'rate-limit', 'contract', 'network', 'unavailable', 'unknown'].includes(kind)
    ? kind
    : 'unknown'
}

const normalizeError = (error: unknown): ResearchStageError => {
  const kind = errorKind(error)
  const original = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown research error'
  const message = original
    .replace(/(cookie|authorization|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .slice(0, 240)
  return {
    kind,
    message,
    fatal: kind === 'authentication' || kind === 'permission' || kind === 'contract',
    retryable: kind === 'network' || kind === 'rate-limit',
  }
}

const validAsin = (asin: string): boolean => /^[A-Z0-9]{10}$/.test(asin.trim().toUpperCase())

const prepareCandidates = (items: readonly ProductCandidate[], limit: number): ProductCandidate[] => {
  const unique = new Map<string, ProductCandidate>()
  for (const item of items) {
    const asin = item.asin.trim().toUpperCase()
    if (!validAsin(asin) || unique.has(asin)) continue
    unique.set(asin, { ...item, asin })
  }
  return [...unique.values()]
    .sort((left, right) => right.discoveryScore - left.discoveryScore
      || (right.estimatedSales ?? -1) - (left.estimatedSales ?? -1))
    .slice(0, limit)
    .map((item, index) => ({ ...item, tier: index === 0 ? 'A' : index < 3 ? 'B' : 'C' }))
}

const chooseAbaPeriod = (periods: readonly AbaPeriod[]): AbaPeriod | null => {
  const latest = (type: AbaPeriod['type']) => [...periods]
    .filter((item) => item.type === type)
    .sort((left, right) => right.table.localeCompare(left.table))[0]
  return latest('W') ?? latest('M') ?? null
}

const statusFor = (completed: number, errors: number, exhausted: boolean): ResearchStageStatus => {
  if (completed === 0 && errors > 0) return 'failed'
  if (errors > 0 || exhausted) return 'partial'
  return 'complete'
}

class CancelledError extends Error {}

export const runResearchPipeline = async (
  input: ResearchInput,
  ports: ResearchPorts,
  options: ResearchPipelineOptions = {},
): Promise<ResearchJob> => {
  const policy = options.policy ?? DEFAULT_RESEARCH_POLICY
  const now = options.now ?? Date.now
  const budget = createBudgetTracker(policy)
  const job: ResearchJob = {
    id: options.jobId ?? `${input.market}:${input.categoryId}:${now()}`,
    input,
    status: 'idle',
    currentStage: null,
    stages: createStages(),
    budget: { ...policy.budget },
    usedBudget: budget.used(),
    evidence: {
      candidates: [],
      reverseKeywords: [],
      seedKeywords: [],
      minedKeywords: [],
      aba: [],
      competitors: [],
      markets: [],
      reviewItems: [],
      reviews: { sampled: 0, lowStarCount: 0, painPoints: [] },
    },
    decision: null,
    errors: [],
    startedAt: now(),
    completedAt: null,
  }
  let remoteBlocked = false

  const emit = () => {
    job.usedBudget = budget.used()
    try { options.onUpdate?.(job) } catch { /* observer failures do not affect research */ }
  }
  const assertActive = () => {
    if (options.signal?.aborted) throw new CancelledError('Research cancelled')
  }
  const start = (stage: ResearchStageId, stageInput: unknown, total: number) => {
    assertActive()
    job.status = 'running'
    job.currentStage = stage
    job.stages[stage] = {
      ...createStage(stage),
      status: 'running',
      startedAt: now(),
      input: stageInput,
      total,
      events: [{ at: now(), type: 'stage', operation: '阶段开始', target: null, message: `计划处理 ${total} 项` }],
    }
    emit()
  }
  const trace = (
    stage: ResearchStageId,
    type: 'request' | 'response' | 'error' | 'skip',
    operation: string,
    target: string | null,
    message: string,
    progress?: { calls?: number; completed?: number },
  ) => {
    const current = job.stages[stage]
    job.stages[stage] = {
      ...current,
      calls: progress?.calls ?? current.calls,
      completed: progress?.completed ?? current.completed,
      events: [...current.events, { at: now(), type, operation, target, message }],
    }
    emit()
  }
  const finish = (
    stage: ResearchStageId,
    status: ResearchStageStatus,
    output: unknown,
    errors: ResearchStageError[],
    calls: number,
    completed: number,
  ) => {
    const current = job.stages[stage]
    const errorEvents = errors.map((error) => ({
      at: now(),
      type: 'error' as const,
      operation: '阶段错误',
      target: null,
      message: `${error.message}（${error.retryable ? '可重试' : '不可重试'}）`,
    }))
    job.stages[stage] = {
      ...current,
      status,
      completedAt: now(),
      output,
      errors,
      calls,
      completed,
      events: [
        ...current.events,
        ...errorEvents,
        { at: now(), type: status === 'skipped' ? 'skip' : 'stage', operation: '阶段结束', target: null, message: `状态：${status}；完成 ${completed}/${current.total}；调用 ${calls} 次` },
      ],
    }
    job.errors.push(...errors.map((error) => `${stage}: ${error.message}`))
    emit()
  }
  const skip = (stage: ResearchStageId, reason: string) => {
    start(stage, null, 0)
    trace(stage, 'skip', '跳过阶段', null, reason)
    finish(stage, 'skipped', { reason }, [], 0, 0)
  }
  const consume = (key: ResearchBudgetKey) => budget.consume(key)
  const portOptions = { signal: options.signal }

  try {
    start('discovery', input, 1)
    if (!consume('discovery')) {
      finish('discovery', 'failed', null, [{ kind: 'unavailable', message: 'Discovery budget is exhausted', fatal: false, retryable: false }], 0, 0)
    } else {
      try {
        trace('discovery', 'request', '候选发现', input.categoryLabel ?? input.categoryId, `请求 ${input.market} 站点一级类目候选`, { calls: 1 })
        const candidates = await ports.products.discover(input, portOptions)
        assertActive()
        job.evidence.candidates = prepareCandidates(candidates, policy.candidateLimits.comparison)
        trace('discovery', 'response', '候选发现', input.categoryLabel ?? input.categoryId, `收到 ${candidates.length} 条，清洗后保留 ${job.evidence.candidates.length} 条`, { calls: 1, completed: 1 })
        finish('discovery', 'complete', { candidates: job.evidence.candidates }, [], 1, 1)
      } catch (error) {
        const normalized = normalizeError(error)
        remoteBlocked = normalized.fatal
        trace('discovery', 'error', '候选发现', input.categoryLabel ?? input.categoryId, normalized.message, { calls: 1 })
        finish('discovery', 'failed', null, [normalized], 1, 0)
      }
    }

    const deepCandidates = job.evidence.candidates.slice(0, policy.candidateLimits.deep)
    if (remoteBlocked || deepCandidates.length === 0) {
      skip('reverseKeywords', remoteBlocked ? 'remote-capabilities-blocked' : 'no-candidates')
    } else {
      start('reverseKeywords', { asins: deepCandidates.map((item) => item.asin) }, deepCandidates.length)
      const metrics: KeywordMetric[] = []
      const errors: ResearchStageError[] = []
      let calls = 0
      let completed = 0
      let exhausted = false
      for (const candidate of deepCandidates) {
        assertActive()
        if (!consume('reverseKeywords')) { exhausted = true; break }
        calls += 1
        trace('reverseKeywords', 'request', 'ASIN 反查', candidate.asin, `正在反查第 ${calls}/${deepCandidates.length} 个候选`, { calls, completed })
        try {
          const result = await ports.reverseKeywords.reverse(candidate.asin, input.market, portOptions)
          assertActive()
          metrics.push(...result.map((item) => ({
            ...item,
            sourceAsins: [...new Set([...(item.sourceAsins ?? []), candidate.asin])],
            sourceTiers: [...new Set([...(item.sourceTiers ?? []), candidate.tier ?? 'C'])] as CandidateTier[],
          })))
          completed += 1
          trace('reverseKeywords', 'response', 'ASIN 反查', candidate.asin, `收到 ${result.length} 个关键词`, { calls, completed })
        } catch (error) {
          const normalized = normalizeError(error)
          errors.push(normalized)
          trace('reverseKeywords', 'error', 'ASIN 反查', candidate.asin, normalized.message, { calls, completed })
          if (normalized.fatal) { remoteBlocked = true; break }
        }
      }
      const brandTerms = [...policy.brandTerms, ...job.evidence.candidates.map((item) => item.brand ?? '').filter(Boolean)]
      job.evidence.reverseKeywords = aggregateKeywords(metrics, brandTerms)
      job.evidence.seedKeywords = selectSeedKeywords(job.evidence.reverseKeywords, policy.seedKeywordLimit)
      finish('reverseKeywords', statusFor(completed, errors.length, exhausted), {
        keywords: job.evidence.reverseKeywords,
        seeds: job.evidence.seedKeywords,
      }, errors, calls, completed)
    }

    if (remoteBlocked || !ports.keywordMining || job.evidence.seedKeywords.length === 0) {
      skip('keywordMining', remoteBlocked ? 'remote-capabilities-blocked' : !ports.keywordMining ? 'capability-unavailable' : 'no-seed-keywords')
    } else {
      const seeds = job.evidence.seedKeywords.slice(0, policy.seedKeywordLimit)
      start('keywordMining', { keywords: seeds.map((item) => item.normalized) }, seeds.length)
      const mined: KeywordMetric[] = []
      const errors: ResearchStageError[] = []
      let calls = 0
      let completed = 0
      let exhausted = false
      for (const seed of seeds) {
        assertActive()
        if (!consume('keywordMining')) { exhausted = true; break }
        calls += 1
        trace('keywordMining', 'request', '关键词挖掘', seed.normalized, `正在扩展第 ${calls}/${seeds.length} 个种子词`, { calls, completed })
        try {
          const result = await ports.keywordMining.mine(seed.normalized, input.market, portOptions)
          mined.push(...result)
          assertActive()
          completed += 1
          trace('keywordMining', 'response', '关键词挖掘', seed.normalized, `收到 ${result.length} 个扩展词`, { calls, completed })
        } catch (error) {
          const normalized = normalizeError(error)
          errors.push(normalized)
          trace('keywordMining', 'error', '关键词挖掘', seed.normalized, normalized.message, { calls, completed })
          if (normalized.fatal) { remoteBlocked = true; break }
        }
      }
      const brandTerms = [...policy.brandTerms, ...job.evidence.candidates.map((item) => item.brand ?? '').filter(Boolean)]
      job.evidence.minedKeywords = aggregateKeywords(mined, brandTerms).slice(0, policy.minedKeywordLimit)
      finish('keywordMining', statusFor(completed, errors.length, exhausted), { keywords: job.evidence.minedKeywords }, errors, calls, completed)
    }

    const keywordPool = aggregateKeywords([
      ...job.evidence.reverseKeywords.map((item) => ({ ...item })),
      ...job.evidence.minedKeywords.map((item) => ({ ...item })),
    ], policy.brandTerms).slice(0, policy.minedKeywordLimit)

    if (remoteBlocked || !ports.aba || keywordPool.length === 0) {
      skip('abaValidation', remoteBlocked ? 'remote-capabilities-blocked' : !ports.aba ? 'capability-unavailable' : 'no-keywords')
    } else {
      const selected = selectAbaKeywords(keywordPool, policy.abaKeywordLimit)
      start('abaValidation', { keywords: selected.map((item) => item.normalized) }, selected.length)
      const errors: ResearchStageError[] = []
      let calls = 0
      let completed = 0
      let exhausted = false
      let period: AbaPeriod | null = null
      try {
        trace('abaValidation', 'request', '读取 ABA 周期', input.market, '正在读取可用周/月周期')
        const periods = await ports.aba.listPeriods(input.market, portOptions)
        period = chooseAbaPeriod(periods)
        assertActive()
        trace('abaValidation', 'response', '读取 ABA 周期', input.market, period ? `选择 ${period.type === 'W' ? '周' : '月'}周期 ${period.label}` : `收到 ${periods.length} 个周期，但没有可用项`)
      } catch (error) {
        const normalized = normalizeError(error)
        errors.push(normalized)
        trace('abaValidation', 'error', '读取 ABA 周期', input.market, normalized.message)
        if (normalized.fatal) remoteBlocked = true
      }
      if (period && !remoteBlocked) {
        for (const keyword of selected) {
          assertActive()
          if (!consume('aba')) { exhausted = true; break }
          calls += 1
          trace('abaValidation', 'request', 'ABA 关键词验证', keyword.normalized, `正在验证第 ${calls}/${selected.length} 个关键词`, { calls, completed })
          try {
            const evidence = await ports.aba.research(keyword.normalized, input.market, period, portOptions)
            assertActive()
            if (evidence) job.evidence.aba.push(evidence)
            completed += 1
            trace('abaValidation', 'response', 'ABA 关键词验证', keyword.normalized, evidence ? `搜索排名 ${evidence.searchRank ?? '—'}，搜索量 ${evidence.searches ?? '—'}` : '请求成功，但没有匹配记录', { calls, completed })
          } catch (error) {
            const normalized = normalizeError(error)
            errors.push(normalized)
            trace('abaValidation', 'error', 'ABA 关键词验证', keyword.normalized, normalized.message, { calls, completed })
            if (normalized.fatal) { remoteBlocked = true; break }
          }
        }
      }
      const status = !period && errors.length === 0 ? 'skipped' : statusFor(completed, errors.length, exhausted)
      finish('abaValidation', status, { period, evidence: job.evidence.aba }, errors, calls, completed)
    }

    const representatives = selectRepresentativeKeywords(keywordPool, policy.representativeKeywordLimit)
    if (remoteBlocked || representatives.length === 0 || (!ports.competitors && !ports.market)) {
      skip('marketStructure', remoteBlocked ? 'remote-capabilities-blocked' : representatives.length === 0 ? 'no-representative-keywords' : 'capability-unavailable')
    } else {
      const total = representatives.length * Number(Boolean(ports.competitors)) + representatives.length * Number(Boolean(ports.market))
      start('marketStructure', { keywords: representatives.map((item) => item.normalized) }, total)
      const errors: ResearchStageError[] = []
      let calls = 0
      let completed = 0
      let exhausted = false
      for (const keyword of representatives) {
        assertActive()
        if (ports.competitors) {
          if (!consume('competitors')) exhausted = true
          else {
            calls += 1
            trace('marketStructure', 'request', '竞品结构', keyword.normalized, `请求代表词竞品样本（调用 ${calls}/${total}）`, { calls, completed })
            try {
              const evidence = await ports.competitors.research(keyword.normalized, input.market, portOptions)
              assertActive()
              if (evidence) job.evidence.competitors.push(evidence)
              completed += 1
              trace('marketStructure', 'response', '竞品结构', keyword.normalized, evidence ? `收到 ${evidence.productCount} 个竞品样本` : '请求成功，但没有竞品证据', { calls, completed })
            } catch (error) {
              const normalized = normalizeError(error)
              errors.push(normalized)
              trace('marketStructure', 'error', '竞品结构', keyword.normalized, normalized.message, { calls, completed })
              if (normalized.fatal) { remoteBlocked = true; break }
            }
          }
        }
        if (remoteBlocked) break
        if (ports.market) {
          if (!consume('market')) exhausted = true
          else {
            calls += 1
            trace('marketStructure', 'request', '市场结构', keyword.normalized, `请求代表词市场摘要（调用 ${calls}/${total}）`, { calls, completed })
            try {
              const evidence = await ports.market.research(keyword.normalized, input.market, portOptions)
              assertActive()
              if (evidence) job.evidence.markets.push(evidence)
              completed += 1
              trace('marketStructure', 'response', '市场结构', keyword.normalized, evidence ? `总商品 ${evidence.totalProducts ?? '—'}，品牌集中度 ${evidence.brandConcentration ?? '—'}` : '请求成功，但没有市场证据', { calls, completed })
            } catch (error) {
              const normalized = normalizeError(error)
              errors.push(normalized)
              trace('marketStructure', 'error', '市场结构', keyword.normalized, normalized.message, { calls, completed })
              if (normalized.fatal) { remoteBlocked = true; break }
            }
          }
        }
      }
      finish('marketStructure', statusFor(completed, errors.length, exhausted), {
        competitors: job.evidence.competitors,
        markets: job.evidence.markets,
      }, errors, calls, completed)
    }

    if (remoteBlocked || !ports.reviews || deepCandidates.length === 0) {
      skip('reviewAnalysis', remoteBlocked ? 'remote-capabilities-blocked' : !ports.reviews ? 'capability-unavailable' : 'no-candidates')
    } else {
      start('reviewAnalysis', { asins: deepCandidates.map((item) => item.asin) }, deepCandidates.length)
      const errors: ResearchStageError[] = []
      const items: ReviewItem[] = []
      let calls = 0
      let completed = 0
      let exhausted = false
      for (const candidate of deepCandidates) {
        assertActive()
        if (!consume('reviews')) { exhausted = true; break }
        calls += 1
        trace('reviewAnalysis', 'request', '近期评论', candidate.asin, `读取第 ${completed + 1}/${deepCandidates.length} 个候选的近期评论`, { calls, completed })
        try {
          const recent = await ports.reviews.list(candidate.asin, input.market, { page: 1, pageSize: 20 }, portOptions)
          assertActive()
          items.push(...recent)
          trace('reviewAnalysis', 'response', '近期评论', candidate.asin, `收到 ${recent.length} 条评论`, { calls, completed })
          if (recent.filter((item) => item.star <= 3).length < 3 && budget.remaining('reviews') > 0) {
            consume('reviews')
            calls += 1
            trace('reviewAnalysis', 'request', '低星评论补样', candidate.asin, '低星样本不足，补充读取 1–3 星评论', { calls, completed })
            const lowStars = await ports.reviews.list(candidate.asin, input.market, { page: 1, pageSize: 20, stars: [1, 2, 3] }, portOptions)
            assertActive()
            const seen = new Set(items.map((item) => `${item.asin}:${item.title}:${item.content}`))
            const uniqueLowStars = lowStars.filter((item) => !seen.has(`${item.asin}:${item.title}:${item.content}`))
            items.push(...uniqueLowStars)
            trace('reviewAnalysis', 'response', '低星评论补样', candidate.asin, `收到 ${lowStars.length} 条，去重后新增 ${uniqueLowStars.length} 条`, { calls, completed })
          }
          completed += 1
          trace('reviewAnalysis', 'response', '评论采样完成', candidate.asin, `候选评论采样完成，累计 ${items.length} 条`, { calls, completed })
        } catch (error) {
          const normalized = normalizeError(error)
          errors.push(normalized)
          trace('reviewAnalysis', 'error', '评论采样', candidate.asin, normalized.message, { calls, completed })
          if (normalized.fatal) { remoteBlocked = true; break }
        }
      }
      job.evidence.reviewItems = items
      job.evidence.reviews = analyzeReviews(items)
      finish('reviewAnalysis', statusFor(completed, errors.length, exhausted), { reviews: job.evidence.reviews }, errors, calls, completed)
    }

    start('decision', {
      candidates: job.evidence.candidates.length,
      keywords: keywordPool.length,
      aba: job.evidence.aba.length,
      markets: job.evidence.markets.length,
      reviews: job.evidence.reviews.sampled,
    }, 1)
    trace('decision', 'request', '综合评分', null, '汇总需求、进入条件、差异化和证据覆盖度')
    job.decision = createDecision(job)
    trace('decision', 'response', '综合评分', null, `结论：${job.decision.label}；可信度 ${job.decision.scores.confidence}%`, { completed: 1 })
    finish('decision', 'complete', job.decision, [], 0, 1)

    const degraded = STAGES.filter((stage) => stage !== 'decision')
      .some((stage) => ['partial', 'failed', 'skipped'].includes(job.stages[stage].status))
    job.status = job.stages.discovery.status === 'failed' && job.evidence.candidates.length === 0
      ? 'failed'
      : degraded ? 'partial' : 'complete'
    job.currentStage = null
    job.completedAt = now()
    emit()
    return job
  } catch (error) {
    if (error instanceof CancelledError) {
      const cancelledStage = job.currentStage
      if (cancelledStage) {
        const current = job.stages[cancelledStage]
        job.stages[cancelledStage] = {
          ...current,
          status: 'cancelled',
          completedAt: now(),
          events: [...current.events, { at: now(), type: 'stage', operation: '任务取消', target: null, message: '用户已取消，后续远端调用不会继续' }],
        }
      }
      job.status = 'cancelled'
      job.currentStage = null
      job.completedAt = now()
      emit()
      return job
    }

    const normalized = normalizeError(error)
    const failedStage = job.currentStage
    if (failedStage) {
      trace(failedStage, 'error', '未预期的流水线异常', null, normalized.message)
      finish(failedStage, 'failed', job.stages[failedStage].output, [normalized], job.stages[failedStage].calls, job.stages[failedStage].completed)
    } else {
      job.errors.push(`pipeline: ${normalized.message}`)
    }
    for (const stage of STAGES) {
      if (job.stages[stage].status !== 'idle') continue
      job.stages[stage] = {
        ...job.stages[stage],
        status: 'skipped',
        completedAt: now(),
        output: { reason: 'pipeline-stopped-after-unexpected-error' },
        events: [{ at: now(), type: 'skip', operation: '跳过阶段', target: null, message: '前序阶段发生未预期错误，流水线已安全停止' }],
      }
    }
    job.status = 'failed'
    job.currentStage = null
    job.completedAt = now()
    emit()
    return job
  }
}

export const getJobProgress = (job: ResearchJob): { complete: number; total: number; percent: number } => {
  const complete = STAGES.filter((stage) => !['idle', 'running'].includes(job.stages[stage].status)).length
  return { complete, total: STAGES.length, percent: Math.round(complete / STAGES.length * 100) }
}