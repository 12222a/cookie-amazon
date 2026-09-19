import type {
  CandidateResearchDecision,
  ProductCandidate,
  ResearchDecision,
  ResearchJob,
  ResearchStageId,
} from './model'
import { summarizeMarketStructure } from './market'
import { selectStrongPainPoints, analyzeReviews } from './reviews'

const clamp = (value: number): number => Math.round(Math.max(0, Math.min(100, value)))
const average = (values: readonly number[]): number => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

const stageCoverage = (job: ResearchJob): number => {
  const stages: ResearchStageId[] = ['discovery', 'reverseKeywords', 'keywordMining', 'abaValidation', 'marketStructure', 'reviewAnalysis']
  return average(stages.map((stage) => {
    const status = job.stages[stage].status
    if (status === 'complete') return 1
    if (status === 'partial') return 0.6
    if (status === 'skipped') return 0.25
    return 0
  }))
}

export const createDecision = (job: ResearchJob): ResearchDecision => {
  const usefulKeywords = [...job.evidence.reverseKeywords, ...job.evidence.minedKeywords]
    .filter((item, index, all) => !item.isBrandTerm && all.findIndex((other) => other.normalized === item.normalized) === index)
  const keywordDemand = average(usefulKeywords.slice(0, 10).map((item) => item.score))
  const purchaseSignals = [
    ...usefulKeywords.map((item) => item.purchaseRate),
    ...job.evidence.aba.map((item) => item.purchaseRate),
  ].filter((value): value is number => value !== null)
  const purchaseScore = purchaseSignals.length === 0 ? keywordDemand : average(purchaseSignals.map((value) => Math.min(100, value / 0.2 * 100)))
  const abaRankScore = average(job.evidence.aba.filter((item) => item.searchRank !== null)
    .map((item) => 100 / (1 + Math.max(0, (item.searchRank ?? 1) - 1) / 20)))
  const demand = clamp(average([keywordDemand, purchaseScore, ...(job.evidence.aba.length > 0 ? [abaRankScore] : [])]))

  const market = summarizeMarketStructure(job.evidence.markets, job.evidence.competitors)
  const concentrationValues = [market.top10SalesConcentration, market.brandConcentration, market.sellerConcentration]
    .filter((value): value is number => value !== null)
  const concentrationEntry = concentrationValues.length === 0 ? 50 : (1 - average(concentrationValues)) * 100
  const reviewBarrier = market.medianReviews === null ? 50 : 100 / (1 + market.medianReviews / 250)
  const newcomer = market.newProductShare === null ? 50 : Math.min(100, market.newProductShare * 200)
  const entry = clamp(average([concentrationEntry, reviewBarrier, newcomer]))

  const strongPainPoints = selectStrongPainPoints(job.evidence.reviews)
  const painPointScore = Math.min(100, strongPainPoints.length * 18 + strongPainPoints.reduce((sum, point) => {
    const lowStarCount = point.lowStarCount ?? Math.round(point.count * point.lowStarShare)
    return sum + lowStarCount * 3
  }, 0))
  const scenarioScore = usefulKeywords.some((item) => item.kind === 'intent' || item.kind === 'attribute') ? 60 : 30
  const differentiation = clamp(average([
    job.evidence.reviews.sampled > 0 ? painPointScore : 35,
    scenarioScore,
    market.extremeConcentration ? 20 : 55,
  ]))

  const confidence = clamp(average([
    stageCoverage(job) * 100,
    Math.min(100, job.evidence.candidates.length / 3 * 100),
    Math.min(100, usefulKeywords.length / 10 * 100),
    job.evidence.reviews.sampled === 0 ? 0 : Math.min(100, job.evidence.reviews.sampled / 15 * 100),
    market.coverage * 100,
  ]))

  const reasons: string[] = []
  const risks: string[] = []
  const missing: string[] = []
  if (demand >= 55) reasons.push('关键词和购买意图信号达到继续研究门槛')
  else if (demand < 30) risks.push('多个需求信号偏弱')
  else risks.push('需求信号尚未形成一致的强证据')
  if (entry >= 50) reasons.push('市场进入条件未显示明显硬阻断')
  else risks.push('集中度、评论壁垒或新品表现显示进入难度较高')
  if (strongPainPoints.length > 0) reasons.push(`发现 ${strongPainPoints.length} 个可验证的高频低星痛点`)
  else missing.push('尚无稳定的低星痛点证据')
  if (market.extremeConcentration) risks.push('代表词市场结构呈现极高集中度')
  if (job.evidence.aba.length === 0) missing.push('缺少 ABA 搜索与购买行为验证')
  if (job.evidence.markets.length === 0) missing.push('缺少代表词市场结构证据')
  if (job.evidence.reviews.sampled === 0) missing.push('缺少评论和差评样本')
  if (confidence < 55) missing.push('关键阶段覆盖度不足，当前结论可信度偏低')
  missing.push('缺少采购、物流、广告、税费、退货和合规成本，不能判断真实利润')

  let verdict: ResearchDecision['verdict'] = 'WATCH'
  if (confidence >= 55 && demand >= 55 && entry >= 45 && differentiation >= 35 && !market.extremeConcentration) verdict = 'CONTINUE'
  else if (confidence >= 50 && demand < 30 && entry < 40 && differentiation < 40) verdict = 'DROP'
  else if (confidence >= 55 && demand < 40 && market.extremeConcentration && differentiation < 35) verdict = 'DROP'
  return {
    verdict,
    label: verdict === 'CONTINUE' ? '继续验证' : verdict === 'DROP' ? '放弃' : '观察',
    scores: { demand, entry, differentiation, confidence },
    reasons,
    risks,
    missing: [...new Set(missing)],
    boundary: '该汇总字段只用于兼容现有调用；ASIN 级优先级和下一步建议以 candidateDecisions 为准，不代表可直接采购、上架或保证盈利。',
  }
}

const candidateEvidence = (job: ResearchJob, candidate: ProductCandidate): ResearchJob => {
  const asin = candidate.asin
  const reverseKeywords = job.evidence.reverseKeywords.filter((item) => item.sourceAsins.includes(asin))
  const seedKeywords = job.evidence.seedKeywords.filter((item) => item.sourceAsins.includes(asin))
  const minedKeywords = job.evidence.minedKeywords.filter((item) => item.sourceAsins.includes(asin))
  const aba = job.evidence.aba.filter((item) => item.sourceAsins?.includes(asin))
  const competitors = job.evidence.competitors.filter((item) => item.sourceAsins?.includes(asin))
  const markets = job.evidence.markets.filter((item) => item.sourceAsins?.includes(asin))
  const reviewItems = job.evidence.reviewItems.filter((item) => item.asin === asin)
  return {
    ...job,
    evidence: {
      ...job.evidence,
      candidates: [candidate],
      reverseKeywords,
      seedKeywords,
      minedKeywords,
      aba,
      competitors,
      markets,
      reviewItems,
      reviews: analyzeCandidateReviews(reviewItems),
    },
    candidateDecisions: [],
  }
}

const analyzeCandidateReviews = (items: ResearchJob['evidence']['reviewItems']) => analyzeReviews(items)

export const createCandidateDecisions = (job: ResearchJob): CandidateResearchDecision[] => job.evidence.candidates.map((candidate) => {
  if (candidate.researchDepth !== 'deep') {
    return {
      asin: candidate.asin,
      priority: '暂不优先',
      nextStep: '保留为横向对比样本；先比较 Top 3 的价格、销量、评论壁垒，再决定是否升级研究。',
      reasons: ['当前轮次研究资源优先用于 Top 3，未为该 ASIN 调用深度研究接口'],
      missing: ['关键词需求、市场结构和评论证据尚未单独验证'],
      scores: { demand: null, entry: null, differentiation: null, confidence: 0 },
    }
  }

  const individual = createDecision(candidateEvidence(job, candidate))
  const priority: CandidateResearchDecision['priority'] = individual.verdict === 'CONTINUE'
    ? '重点验证'
    : individual.verdict === 'DROP'
      ? '暂不优先'
      : '待补充研究'
  const nextStep = priority === '重点验证'
    ? '进入采购、成本、合规和差异化验证；继续核对证据对应的具体 ASIN。'
    : priority === '待补充研究'
      ? '补齐标记为缺失的关键词、ABA、市场或评论证据后，再决定是否推进。'
      : '暂不投入深度研究资源；保留当前证据，等待新的真实数据或下一轮发现。'
  return {
    asin: candidate.asin,
    priority,
    nextStep,
    reasons: individual.reasons,
    missing: individual.missing,
    scores: individual.scores,
  }
})
