import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RESEARCH_POLICY,
  ResearchPortError,
  aggregateKeywords,
  analyzeReviews,
  createBudgetTracker,
  mergeResearchPolicy,
  normalizeKeyword,
  runResearchPipeline,
  selectStrongPainPoints,
  selectSeedKeywords,
  summarizeMarketStructure,
  type ProductCandidate,
  type ResearchPorts,
} from '../index'

const candidate = (index: number): ProductCandidate => ({
  asin: `B${String(index).padStart(9, '0')}`,
  title: `Portable stand ${index}`,
  brand: `Brand${index}`,
  imageUrl: null,
  estimatedSales: 500 - index,
  salesGrowth: 0.2,
  price: 25,
  rating: 4.3,
  reviews: 120,
  sellers: 1,
  discoveryScore: 80 - index,
})

const input = { market: 'US', categoryId: '123', categoryLabel: 'Office' }

const createPorts = (): ResearchPorts => ({
  products: { discover: async () => [candidate(1), candidate(2), candidate(3)] },
  reverseKeywords: {
    reverse: async (asin) => [{
      keyword: 'Portable Laptop Stand',
      searchVolume: 10_000,
      purchaseRate: 0.15,
      supplyDemandRatio: 0.5,
      relevancy: 0.9,
      rank: Number(asin.at(-1)),
      products: 5_000,
    }],
  },
  keywordMining: {
    mine: async () => [{
      keyword: 'adjustable stand for travel',
      searchVolume: 5_000,
      purchaseRate: 0.1,
      supplyDemandRatio: 1,
      relevancy: 0.8,
      rank: 8,
      products: 4_000,
    }],
  },
  aba: {
    listPeriods: async () => [
      { table: '2026-07', label: 'July', type: 'M' },
      { table: '2026-W32', label: 'Week 32', type: 'W' },
    ],
    research: async (keyword, _market, period) => ({
      keyword,
      period,
      searchRank: 5,
      searches: 9_000,
      purchases: 1_000,
      purchaseRate: 0.12,
      products: 5_000,
      rankGrowthRate: 0.05,
      clickShareRate: 0.3,
      conversionShareRate: 0.25,
    }),
  },
  competitors: {
    research: async (keyword) => ({
      keyword,
      productCount: 100,
      estimatedSales: 10_000,
      top10SalesConcentration: 0.3,
      medianReviews: 100,
      medianListingAgeDays: 300,
      newListingShare: 0.2,
    }),
  },
  market: {
    research: async (keyword) => ({
      keyword,
      totalProducts: 5_000,
      totalSales: 20_000,
      fbaRatio: 0.7,
      amzRatio: 0.05,
      fbmRatio: 0.25,
      brandConcentration: 0.25,
      sellerConcentration: 0.3,
      newProductShare: 0.2,
    }),
  },
  reviews: {
    list: async (asin, _market, query) => query?.stars
      ? [{ asin, star: 1, title: 'Same review, alternate upstream title', content: 'Poor quality, broke after a week', variation: ['Black'], likes: 2 }]
      : [
          { asin, star: 2, title: 'Broken', content: 'Poor quality, broke after a week', variation: ['Black'], likes: 2 },
          { asin, star: 5, title: 'Useful', content: 'Easy to install and use', variation: ['Silver'], likes: 0 },
        ],
  },
})

describe('keyword research rules', () => {
  it('normalizes, deduplicates and aggregates sources without deleting brand terms', () => {
    const result = aggregateKeywords([
      { keyword: '  Laptop—Stand ', searchVolume: 100, purchaseRate: 0.1, supplyDemandRatio: 2, relevancy: 0.8, rank: 10, products: 20, sourceAsins: ['B000000001'] },
      { keyword: 'laptop stand', searchVolume: 200, purchaseRate: 0.2, supplyDemandRatio: 1, relevancy: 0.9, rank: 5, products: 30, sourceAsins: ['B000000002'] },
      { keyword: 'Acme laptop stand', searchVolume: 500, purchaseRate: null, supplyDemandRatio: null, relevancy: null, rank: null, products: null },
    ], ['Acme'])

    expect(normalizeKeyword('  Laptop—Stand ')).toBe('laptop stand')
    expect(result).toHaveLength(2)
    expect(result.find((item) => item.normalized === 'laptop stand')).toMatchObject({
      searchVolume: 200,
      purchaseRate: 0.2,
      supplyDemandRatio: 1,
      rank: 5,
      sourceCount: 2,
    })
    expect(result.find((item) => item.normalized.startsWith('acme'))?.isBrandTerm).toBe(true)
    expect(selectSeedKeywords(result)).not.toContainEqual(expect.objectContaining({ isBrandTerm: true }))
  })
})

describe('budget and evidence analysis', () => {
  it('prevents calls beyond each capability budget', () => {
    const tracker = createBudgetTracker(mergeResearchPolicy({ budget: { ...DEFAULT_RESEARCH_POLICY.budget, aba: 1 } }))
    expect(tracker.consume('aba')).toBe(true)
    expect(tracker.consume('aba')).toBe(false)
    expect(tracker.remaining('aba')).toBe(0)
    expect(tracker.used().aba).toBe(1)
  })

  it('creates no pain points without review evidence and aggregates low-star themes', () => {
    expect(analyzeReviews([])).toEqual({ sampled: 0, lowStarCount: 0, painPoints: [] })
    const evidence = analyzeReviews([
      { asin: 'B000000001', star: 1, title: 'Broken', content: 'Cheap plastic and poor quality', variation: ['Black'], likes: 1 },
      { asin: 'B000000001', star: 2, title: 'Different upstream title', content: 'Cheap plastic and poor quality', variation: ['Black'], likes: 1 },
      { asin: 'B000000002', star: 2, title: 'Cracked', content: 'Broken after one day', variation: ['Blue'], likes: 0 },
      { asin: 'B000000003', star: 5, title: 'Great quality', content: 'Durable and perfect', variation: ['White'], likes: 2 },
    ])
    expect(evidence).toMatchObject({ sampled: 3, lowStarCount: 2 })
    expect(evidence.painPoints[0]).toMatchObject({
      id: 'quality', count: 3, lowStarCount: 2, asinCount: 3, lowStarShare: 2 / 3,
      excerpts: ['Broken Cheap plastic and poor quality', 'Cracked Broken after one day'],
    })
    expect(evidence.painPoints[0]?.excerpts.join(' ')).not.toContain('Great quality')
    expect(evidence.painPoints[0]?.excerpts).toHaveLength(2)
  })

  it('does not treat duplicate long low-star reviews as a high-frequency pain point', () => {
    const sharedContent = 'Poor quality material broke immediately and could not hold the item safely. '.repeat(4)
    const evidence = analyzeReviews([
      { asin: 'B000000001', star: 2, title: 'Disappointed', content: `${sharedContent}upstream suffix A`, variation: [], likes: 0 },
      { asin: 'B000000001', star: 2, title: 'Disappointed', content: `${sharedContent}upstream suffix B`, variation: [], likes: 0 },
    ])

    expect(evidence).toMatchObject({ sampled: 1, lowStarCount: 1 })
    expect(evidence.painPoints[0]).toMatchObject({ id: 'quality', count: 1, lowStarCount: 1 })
    expect(selectStrongPainPoints(evidence)).toEqual([])
  })

  it('flags extreme market concentration', () => {
    const summary = summarizeMarketStructure([
      { keyword: 'stand', totalProducts: 100, totalSales: 1_000, fbaRatio: 0.8, amzRatio: 0.1, fbmRatio: 0.1, brandConcentration: 0.8, sellerConcentration: 0.75, newProductShare: 0.02 },
    ], [
      { keyword: 'stand', productCount: 100, estimatedSales: 1_000, top10SalesConcentration: 0.9, medianReviews: 2_000, medianListingAgeDays: 2_000, newListingShare: 0.01 },
    ])
    expect(summary.extremeConcentration).toBe(true)
    expect(summary.coverage).toBe(1)
  })
})

describe('research pipeline', () => {
  it('runs the full flow with weekly ABA preference and traceable stage evidence', async () => {
    const job = await runResearchPipeline(input, createPorts(), { jobId: 'job-full', now: () => 1 })

    expect(job.status).toBe('complete')
    expect(job.evidence.candidates.map((item) => item.tier)).toEqual(['A', 'B', 'B'])
    expect(job.evidence.candidates.map((item) => item.researchDepth)).toEqual(['deep', 'deep', 'deep'])
    expect(job.evidence.reverseKeywords[0]?.sourceCount).toBe(3)
    expect(job.evidence.aba[0]?.period.type).toBe('W')
    expect(job.stages.reverseKeywords).toMatchObject({ status: 'complete', calls: 3, completed: 3 })
    expect(job.stages.reverseKeywords.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'request', operation: 'ASIN 反查', target: 'B000000001' }),
      expect.objectContaining({ type: 'response', operation: 'ASIN 反查', target: 'B000000001' }),
    ]))
    expect(job.stages.marketStructure.calls).toBeGreaterThan(0)
    expect(job.evidence.reviewItems).toHaveLength(6)
    expect(job.evidence.reviews).toMatchObject({ sampled: 6, lowStarCount: 3 })
    expect(job.decision).toMatchObject({ verdict: 'CONTINUE', label: '继续验证' })
    expect(job.decision?.boundary).toContain('不代表可直接采购')
  })

  it('aggregates the default three discovery pages before deduplicating and ranking candidates', async () => {
    const ports = createPorts()
    const requestedPages: number[] = []
    ports.products.discoverPage = async (_input, page) => {
      requestedPages.push(page)
      return {
        page,
        pages: 3,
        total: 5,
        hasNextPage: page < 3,
        items: page === 1
          ? [candidate(1), candidate(2)]
          : page === 2 ? [candidate(2), candidate(3)] : [candidate(4)],
      }
    }

    const job = await runResearchPipeline(input, ports, {
      jobId: 'job-discovery-default-pages',
      policy: mergeResearchPolicy({ candidateLimits: { comparison: 4, deep: 3 } }),
    })
    const output = job.stages.discovery.output as {
      requestedPages: number
      attemptedPages: number
      successfulPages: number
      fetchedItems: number
      retainedCandidates: number
    }

    expect(requestedPages).toEqual([1, 2, 3])
    expect(job.input.discoveryPages).toBe(3)
    expect(job.stages.discovery).toMatchObject({ status: 'complete', calls: 3, completed: 3 })
    expect(job.evidence.candidates.map((item) => item.asin)).toEqual([
      'B000000001', 'B000000002', 'B000000003', 'B000000004',
    ])
    expect(output).toMatchObject({ requestedPages: 3, attemptedPages: 3, successfulPages: 3, fetchedItems: 5, retainedCandidates: 4 })
    expect(job.usedBudget.discovery).toBe(3)
  })

  it('falls back to an expanded category scan when strict opportunity filters return no products', async () => {
    const ports = createPorts()
    const requests: string[] = []
    ports.products.discoverPage = async (researchInput, page) => {
      const profile = researchInput.discoveryProfile ?? 'strict'
      requests.push(`${profile}:${page}`)
      if (profile === 'strict') {
        return { page, pages: 1, total: 0, hasNextPage: false, items: [] }
      }
      return {
        page,
        pages: 2,
        total: 2,
        hasNextPage: page < 2,
        items: [candidate(page)],
      }
    }

    const job = await runResearchPipeline({ ...input, discoveryPages: 3 }, ports, { jobId: 'job-discovery-expanded-fallback' })

    expect(requests).toEqual(['strict:1', 'expanded:1', 'expanded:2'])
    expect(job.status).toBe('complete')
    expect(job.stages.discovery).toMatchObject({ status: 'complete', calls: 3, completed: 3 })
    expect(job.stages.discovery.output).toEqual(expect.objectContaining({
      filterProfile: 'expanded', fallbackTriggered: true, fetchedItems: 2, retainedCandidates: 2,
      attempts: [
        expect.objectContaining({ profile: 'strict', fetchedItems: 0, stoppedReason: 'empty-page' }),
        expect.objectContaining({ profile: 'expanded', fetchedItems: 2, stoppedReason: 'no-next-page' }),
      ],
    }))
    expect(job.evidence.candidates).toHaveLength(2)
  })

  it('supplements a sparse strict result with expanded pages and keeps unique ASINs', async () => {
    const ports = createPorts()
    const requests: string[] = []
    ports.products.discoverPage = async (researchInput, page) => {
      const profile = researchInput.discoveryProfile ?? 'strict'
      requests.push(`${profile}:${page}`)
      if (profile === 'strict') {
        return {
          page,
          pages: 1,
          total: 2,
          hasNextPage: false,
          items: [candidate(1), candidate(2)],
        }
      }
      return {
        page,
        pages: 2,
        total: 5,
        hasNextPage: page < 2,
        items: page === 1
          ? [candidate(1), candidate(3), candidate(4)]
          : [candidate(5), candidate(6)],
      }
    }

    const job = await runResearchPipeline({ ...input, discoveryPages: 3 }, ports, { jobId: 'job-discovery-sparse-fallback' })

    expect(requests).toEqual(['strict:1', 'expanded:1', 'expanded:2'])
    expect(job.stages.discovery).toMatchObject({ status: 'complete', calls: 3, completed: 3 })
    expect(job.stages.discovery.output).toEqual(expect.objectContaining({
      filterProfile: 'expanded',
      fallbackTriggered: true,
      fallbackReason: 'sparse',
      strictUniqueCandidateCount: 2,
      candidateTarget: 10,
      fetchedItems: 7,
      uniqueCandidateCount: 6,
      retainedCandidates: 6,
    }))
    expect(job.evidence.candidates.map((item) => item.asin)).toEqual([
      'B000000001', 'B000000002', 'B000000003', 'B000000004', 'B000000005', 'B000000006',
    ])
  })

  it('treats an empty expanded scan as a completed no-candidate outcome instead of a category error', async () => {
    const ports = createPorts()
    const profiles: string[] = []
    ports.products.discoverPage = async (researchInput, page) => {
      profiles.push(researchInput.discoveryProfile ?? 'strict')
      return { page, pages: 1, total: 0, hasNextPage: false, items: [] }
    }

    const job = await runResearchPipeline({ ...input, discoveryPages: 5 }, ports, { jobId: 'job-discovery-empty-expanded' })

    expect(profiles).toEqual(['strict', 'expanded'])
    expect(job.status).toBe('complete')
    expect(job.stages.discovery).toMatchObject({ status: 'complete', calls: 2, completed: 2, errors: [] })
    expect(job.stages.discovery.output).toEqual(expect.objectContaining({
      filterProfile: 'expanded', fallbackTriggered: true, fetchedItems: 0, retainedCandidates: 0,
    }))
    expect(job.evidence.candidates).toEqual([])
    expect(job.stages.reverseKeywords).toMatchObject({ status: 'skipped', output: { reason: 'no-candidates' } })
  })

  it('does not hide a real first-page error behind the expanded fallback', async () => {
    const ports = createPorts()
    const profiles: string[] = []
    ports.products.discoverPage = async (researchInput) => {
      profiles.push(researchInput.discoveryProfile ?? 'strict')
      throw new ResearchPortError('network', 'strict request timeout')
    }

    const job = await runResearchPipeline({ ...input, discoveryPages: 3 }, ports, { jobId: 'job-discovery-real-error' })

    expect(profiles).toEqual(['strict'])
    expect(job.status).toBe('failed')
    expect(job.stages.discovery).toMatchObject({ status: 'failed', calls: 1, completed: 0 })
    expect(job.stages.discovery.output).toEqual(expect.objectContaining({ fallbackTriggered: false }))
  })

  it.each([1, 5] as const)('honors a user-selected %i-page discovery range', async (discoveryPages) => {
    const ports = createPorts()
    const requestedPages: number[] = []
    ports.products.discoverPage = async (_input, page) => {
      requestedPages.push(page)
      return { page, pages: 5, total: 5, hasNextPage: page < 5, items: [candidate(page)] }
    }

    const job = await runResearchPipeline({ ...input, discoveryPages }, ports, {
      jobId: `job-discovery-${discoveryPages}`,
      policy: mergeResearchPolicy({ candidateLimits: { comparison: 1, deep: 1 } }),
    })

    expect(requestedPages).toEqual(Array.from({ length: discoveryPages }, (_, index) => index + 1))
    expect(job.stages.discovery.calls).toBe(discoveryPages)
    expect(job.budget.discovery).toBe(discoveryPages * 2)
  })

  it('stops discovery early when SellerSprite reports no next page or returns an empty page', async () => {
    const noNextPorts = createPorts()
    noNextPorts.products.discoverPage = async (_input, page) => ({
      page,
      pages: 5,
      total: 1,
      hasNextPage: false,
      items: [candidate(1)],
    })
    const noNext = await runResearchPipeline({ ...input, discoveryPages: 5 }, noNextPorts, {
      jobId: 'job-discovery-no-next',
      policy: mergeResearchPolicy({ candidateLimits: { comparison: 1, deep: 1 } }),
    })
    expect(noNext.stages.discovery).toMatchObject({ status: 'complete', calls: 1, completed: 1 })
    expect(noNext.stages.discovery.output).toEqual(expect.objectContaining({ stoppedReason: 'no-next-page', successfulPages: 1 }))

    const emptyPorts = createPorts()
    emptyPorts.products.discoverPage = async (_input, page) => ({
      page,
      pages: 5,
      total: 1,
      hasNextPage: true,
      items: page === 1 ? [candidate(1)] : [],
    })
    const empty = await runResearchPipeline({ ...input, discoveryPages: 5 }, emptyPorts, {
      jobId: 'job-discovery-empty-page',
      policy: mergeResearchPolicy({ candidateLimits: { comparison: 1, deep: 1 } }),
    })
    expect(empty.stages.discovery).toMatchObject({ status: 'complete', calls: 2, completed: 2 })
    expect(empty.stages.discovery.output).toEqual(expect.objectContaining({ stoppedReason: 'empty-page', successfulPages: 2 }))
  })

  it('keeps earlier discovery pages when a later page fails and marks the stage partial', async () => {
    const ports = createPorts()
    ports.products.discoverPage = async (_input, page) => {
      if (page === 2) throw new ResearchPortError('network', 'page 2 timeout')
      return { page, pages: 3, total: 3, hasNextPage: true, items: [candidate(1)] }
    }

    const job = await runResearchPipeline({ ...input, discoveryPages: 3 }, ports, { jobId: 'job-discovery-later-failure' })

    expect(job.status).toBe('partial')
    expect(job.stages.discovery).toMatchObject({ status: 'partial', calls: 2, completed: 1 })
    expect(job.stages.discovery.output).toEqual(expect.objectContaining({ stoppedReason: 'page-error', fetchedItems: 1, retainedCandidates: 1 }))
    expect(job.evidence.candidates).toHaveLength(1)
    expect(job.stages.reverseKeywords.status).not.toBe('skipped')
  })

  it('fails discovery when the first requested page fails', async () => {
    const ports = createPorts()
    ports.products.discoverPage = async () => { throw new ResearchPortError('network', 'page 1 timeout') }

    const job = await runResearchPipeline({ ...input, discoveryPages: 3 }, ports, { jobId: 'job-discovery-first-failure' })

    expect(job.status).toBe('failed')
    expect(job.stages.discovery).toMatchObject({ status: 'failed', calls: 1, completed: 0 })
    expect(job.evidence.candidates).toEqual([])
  })

  it('outputs every matching ASIN while limiting deep research to three candidates', async () => {
    const ports = createPorts()
    ports.products.discover = async () => [
      ...Array.from({ length: 12 }, (_, index) => candidate(index + 1)),
      candidate(1),
      { ...candidate(13), asin: 'invalid' },
    ]
    const policy = mergeResearchPolicy({ candidateLimits: { comparison: 99, deep: 99 } })
    const job = await runResearchPipeline(input, ports, { jobId: 'job-candidate-limits', policy })

    expect(job.evidence.candidates).toHaveLength(12)
    expect(job.candidateDecisions).toHaveLength(12)
    expect(job.evidence.candidates.map((item) => item.tier)).toEqual(['A', 'B', 'B', ...Array.from({ length: 9 }, () => 'C')])
    expect(job.evidence.candidates.filter((item) => item.researchDepth === 'deep')).toHaveLength(3)
    expect(job.evidence.candidates.filter((item) => item.researchDepth === 'comparison')).toHaveLength(9)
    expect(job.stages.reverseKeywords).toMatchObject({ total: 3, calls: 3, completed: 3 })
    expect(job.stages.reviewAnalysis).toMatchObject({ total: 3, completed: 3 })
  })

  it('keeps successful ASIN evidence when one reverse lookup fails', async () => {
    const ports = createPorts()
    const original = ports.reverseKeywords.reverse
    ports.reverseKeywords.reverse = async (asin, market, options) => {
      if (asin === 'B000000002') throw new ResearchPortError('network', 'temporary timeout')
      return original(asin, market, options)
    }
    const job = await runResearchPipeline(input, ports, { jobId: 'job-partial' })

    expect(job.status).toBe('partial')
    expect(job.stages.reverseKeywords).toMatchObject({ status: 'partial', completed: 2, calls: 3 })
    expect(job.evidence.reverseKeywords[0]?.sourceCount).toBe(2)
    expect(job.decision).not.toBeNull()
  })

  it('marks a stage partial when its call budget is exhausted', async () => {
    const policy = mergeResearchPolicy({ budget: { ...DEFAULT_RESEARCH_POLICY.budget, reverseKeywords: 1 } })
    const job = await runResearchPipeline(input, createPorts(), { jobId: 'job-budget', policy })

    expect(job.stages.reverseKeywords).toMatchObject({ status: 'partial', calls: 1, completed: 1 })
    expect(job.usedBudget.reverseKeywords).toBe(1)
    expect(job.evidence.reverseKeywords).not.toHaveLength(0)
  })

  it('returns an observation with low confidence for empty keyword evidence', async () => {
    const ports = createPorts()
    ports.reverseKeywords.reverse = async () => []
    const job = await runResearchPipeline(input, ports, { jobId: 'job-empty' })

    expect(job.stages.keywordMining.status).toBe('skipped')
    expect(job.decision?.verdict).toBe('WATCH')
    expect(job.decision?.scores.confidence).toBeLessThan(55)
    expect(job.decision?.missing).toContain('关键阶段覆盖度不足，当前结论可信度偏低')
  })

  it('falls back to the latest monthly ABA period when weekly periods are unavailable', async () => {
    const ports = createPorts()
    if (!ports.aba) throw new Error('ABA mock missing')
    ports.aba.listPeriods = async () => [{ table: '2026-07', label: 'July', type: 'M' }]
    const job = await runResearchPipeline(input, ports, { jobId: 'job-monthly-fallback' })

    expect(job.evidence.aba[0]?.period.type).toBe('M')
    expect(job.stages.abaValidation.status).toBe('complete')
  })

  it('stops later remote capabilities after a fatal contract error while preserving a decision', async () => {
    const ports = createPorts()
    ports.reverseKeywords.reverse = async () => { throw new ResearchPortError('contract', 'TARGET_RESPONSE_INVALID') }
    const job = await runResearchPipeline(input, ports, { jobId: 'job-fatal' })

    expect(job.stages.reverseKeywords.status).toBe('failed')
    expect(job.stages.keywordMining.status).toBe('skipped')
    expect(job.stages.marketStructure.status).toBe('skipped')
    expect(job.stages.decision.status).toBe('complete')
    expect(job.decision?.verdict).toBe('WATCH')
  })

  it('safely returns a failed job when malformed evidence causes an unexpected transform error', async () => {
    const ports = createPorts()
    ports.reverseKeywords.reverse = async () => [{
      keyword: null as unknown as string,
      searchVolume: 100,
      purchaseRate: 0.1,
      supplyDemandRatio: 1,
      relevancy: 0.5,
      rank: 10,
      products: 100,
    }]

    const job = await runResearchPipeline(input, ports, { jobId: 'job-unexpected' })

    expect(job.status).toBe('failed')
    expect(job.currentStage).toBeNull()
    expect(job.completedAt).not.toBeNull()
    expect(job.errors.some((message) => message.startsWith('reverseKeywords:'))).toBe(true)
    expect(job.stages.keywordMining.status).toBe('skipped')
    expect(job.stages.reverseKeywords.events.some((event) => event.operation === '未预期的流水线异常')).toBe(true)
  })

  it('can abandon a well-covered opportunity with weak demand and extreme barriers', async () => {
    const ports = createPorts()
    ports.reverseKeywords.reverse = async () => [{
      keyword: 'portable stand', searchVolume: 10, purchaseRate: 0.001,
      supplyDemandRatio: 100, relevancy: 0.1, rank: 100, products: 1_000_000,
    }]
    if (ports.keywordMining) ports.keywordMining.mine = async () => []
    if (ports.aba) ports.aba.research = async (keyword, _market, period) => ({
      keyword, period, searchRank: 100, searches: 10, purchases: 0, purchaseRate: 0.001,
      products: 1_000_000, rankGrowthRate: -0.5, clickShareRate: 0.9, conversionShareRate: 0.9,
    })
    if (ports.competitors) ports.competitors.research = async (keyword) => ({
      keyword, productCount: 10_000, estimatedSales: 100, top10SalesConcentration: 0.95,
      medianReviews: 3_000, medianListingAgeDays: 2_000, newListingShare: 0.01,
    })
    if (ports.market) ports.market.research = async (keyword) => ({
      keyword, totalProducts: 10_000, totalSales: 100, fbaRatio: 0.9, amzRatio: 0.05,
      fbmRatio: 0.05, brandConcentration: 0.9, sellerConcentration: 0.9, newProductShare: 0.01,
    })
    if (ports.reviews) ports.reviews.list = async (asin) => [
      { asin, star: 5, title: 'Fine', content: 'Works as expected', variation: [], likes: 0 },
    ]
    const job = await runResearchPipeline(input, ports, { jobId: 'job-drop' })

    expect(job.decision?.verdict).toBe('DROP')
    expect(job.decision?.risks).toContain('代表词市场结构呈现极高集中度')
  })

  it('cancels without allowing later stages to run', async () => {
    const controller = new AbortController()
    const job = await runResearchPipeline(input, createPorts(), {
      jobId: 'job-cancelled',
      signal: controller.signal,
      onUpdate(current) {
        if (current.currentStage === 'discovery' && current.stages.discovery.status === 'running') controller.abort()
      },
    })

    expect(job.status).toBe('cancelled')
    expect(job.stages.discovery.status).toBe('cancelled')
    expect(job.stages.reverseKeywords.status).toBe('idle')
    expect(job.decision).toBeNull()
  })
})