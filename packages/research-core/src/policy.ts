import type { ResearchBudget } from './model'

export type ResearchPolicy = {
  version: string
  candidateLimits: { deep: number; comparison: number }
  seedKeywordLimit: number
  minedKeywordLimit: number
  abaKeywordLimit: number
  representativeKeywordLimit: number
  brandTerms: string[]
  budget: ResearchBudget
}

export const MAX_COMPARISON_CANDIDATES = 10
export const MAX_DEEP_CANDIDATES = 3

export const DEFAULT_RESEARCH_POLICY: ResearchPolicy = {
  version: '2026-08-22-v1',
  candidateLimits: { deep: 3, comparison: 10 },
  seedKeywordLimit: 3,
  minedKeywordLimit: 50,
  abaKeywordLimit: 5,
  representativeKeywordLimit: 3,
  brandTerms: [],
  budget: {
    discovery: 1,
    reverseKeywords: 3,
    keywordMining: 3,
    aba: 5,
    competitors: 3,
    market: 3,
    reviews: 6,
  },
}

export const mergeResearchPolicy = (override: Partial<ResearchPolicy> = {}): ResearchPolicy => ({
  ...DEFAULT_RESEARCH_POLICY,
  ...override,
  candidateLimits: { ...DEFAULT_RESEARCH_POLICY.candidateLimits, ...override.candidateLimits },
  budget: { ...DEFAULT_RESEARCH_POLICY.budget, ...override.budget },
  brandTerms: override.brandTerms ?? DEFAULT_RESEARCH_POLICY.brandTerms,
})