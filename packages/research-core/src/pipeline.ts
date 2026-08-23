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
    job.stages[stage] = { ...createStage(stage), status: 'running', startedAt: now(), input: stageInput, total }
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
    job.stages[stage] = { ...job.stages[stage], status, completedAt: now(), output, errors, calls, completed }
    job.errors.push(...errors.map((error) => `${stage}: ${error.message}`))
    emit()
  }
  const skip = (stage: ResearchStageId, reason: string) => {
    start(stage, null, 0)
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
        const candidates = await ports.products.discover(input, portOptions)
        assertActive()
        job.evidence.candidates = prepareCandidates(candidates, policy.candidateLimits.comparison)
        finish('discovery', 'complete', { candidates: job.evidence.candidates }, [], 1, 1)
      } catch (error) {
        const normalized = normalizeError(error)
        remoteBlocked = normalized.fatal
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
        try {
          const result = await ports.reverseKeywords.reverse(candidate.asin, input.market, portOptions)
          assertActive()
          metrics.push(...result.map((item) => ({
            ...item,
            sourceAsins: [...new Set([...(item.sourceAsins ?? []), candidate.asin])],
            sourceTiers: [...new Set([...(item.sourceTiers ?? []), candidate.tier ?? 'C'])] as CandidateTier[],
          })))
          completed += 1
        } catch (error) {
          const normalized = normalizeError(error)
          errors.push(normalized)
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
        try {
          mined.push(...await ports.keywordMining.mine(seed.normalized, input.market, portOptions))
          assertActive()
          completed += 1
        } catch (error) {
          const normalized = normalizeError(error)
          errors.push(normalized)
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
        period = chooseAbaPeriod(await ports.aba.listPeriods(input.market, portOptions))
        assertActive()
      } catch (error) {
        const normalized = normalizeError(error)
        errors.push(normalized)
        if (normalized.fatal) remoteBlocked = true
      }
      if (period && !remoteBlocked) {
        for (const keyword of selected) {
          assertActive()
          if (!consume('aba')) { exhausted = true; break }
          calls += 1
          try {
            const evidence = await ports.aba.research(keyword.normalized, input.market, period, portOptions)
            assertActive()
            if (evidence) job.evidence.aba.push(evidence)
            completed += 1
          } catch (error) {
            const normalized = normalizeError(error)
            errors.push(normalized)
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
            try {
              const evidence = await ports.competitors.research(keyword.normalized, input.market, portOptions)
              assertActive()
              if (evidence) job.evidence.competitors.push(evidence)
              completed += 1
            } catch (error) {
              const normalized = normalizeError(error)
              errors.push(normalized)
              if (normalized.fatal) { remoteBlocked = true; break }
            }
          }
        }
        if (remoteBlocked) break
        if (ports.market) {
          if (!consume('market')) exhausted = true
          else {
            calls += 1
            try {
              const evidence = await ports.market.research(keyword.normalized, input.market, portOptions)
              assertActive()
              if (evidence) job.evidence.markets.push(evidence)
              completed += 1
            } catch (error) {
              const normalized = normalizeError(error)
              errors.push(normalized)
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
        try {
          const recent = await ports.reviews.list(candidate.asin, input.market, { page: 1, pageSize: 20 }, portOptions)
          assertActive()
          items.push(...recent)
          if (recent.filter((item) => item.star <= 3).length < 3 && budget.remaining('reviews') > 0) {
            consume('reviews')
            calls += 1
            const lowStars = await ports.reviews.list(candidate.asin, input.market, { page: 1, pageSize: 20, stars: [1, 2, 3] }, portOptions)
            assertActive()
            const seen = new Set(items.map((item) => `${item.asin}:${item.title}:${item.content}`))
            items.push(...lowStars.filter((item) => !seen.has(`${item.asin}:${item.title}:${item.content}`)))
          }
          completed += 1
        } catch (error) {
          const normalized = normalizeError(error)
          errors.push(normalized)
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
    job.decision = createDecision(job)
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
    if (!(error instanceof CancelledError)) throw error
    const cancelledStage = job.currentStage
    if (cancelledStage) {
      job.stages[cancelledStage] = { ...job.stages[cancelledStage], status: 'cancelled', completedAt: now() }
    }
    job.status = 'cancelled'
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