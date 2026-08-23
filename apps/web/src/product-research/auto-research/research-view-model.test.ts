import { describe, expect, it } from 'vitest'
import { DEFAULT_RESEARCH_POLICY, type ResearchJob } from '@cookie-amazon/research-core'
import {
  EVIDENCE_TABS,
  STAGE_LABELS,
  STATUS_LABELS,
  formatResearchNumber,
  formatResearchRatio,
  stageImpact,
  sumBudget,
} from './research-view-model'

describe('automatic research view model', () => {
  it('keeps all seven pipeline stages and six report tabs visible', () => {
    expect(Object.keys(STAGE_LABELS)).toEqual([
      'discovery',
      'reverseKeywords',
      'keywordMining',
      'abaValidation',
      'marketStructure',
      'reviewAnalysis',
      'decision',
    ])
    expect(EVIDENCE_TABS.map((tab) => tab.id)).toEqual([
      'overview',
      'candidates',
      'keywords',
      'market',
      'reviews',
      'execution',
    ])
  })

  it('formats missing metrics explicitly instead of inventing values', () => {
    expect(formatResearchNumber(null)).toBe('—')
    expect(formatResearchRatio(undefined)).toBe('—')
    expect(formatResearchNumber(12_345.67)).toBe('12,345.7')
    expect(formatResearchRatio(0.126)).toBe('13%')
  })

  it('shows partial, skipped, failed and cancelled execution impacts', () => {
    const job = {
      stages: {
        discovery: { status: 'partial' },
        reverseKeywords: { status: 'skipped' },
        keywordMining: { status: 'failed' },
        abaValidation: { status: 'cancelled' },
      },
    } as unknown as ResearchJob

    expect(stageImpact(job, 'discovery')).toContain('可信度')
    expect(stageImpact(job, 'reverseKeywords')).toContain('证据缺口')
    expect(stageImpact(job, 'keywordMining')).toContain('其他阶段结果')
    expect(stageImpact(job, 'abaValidation')).toContain('不会继续')
    expect(STATUS_LABELS.partial).toBe('部分成功')
  })

  it('derives the displayed remote-call budget from the domain policy', () => {
    expect(sumBudget(DEFAULT_RESEARCH_POLICY.budget)).toBe(24)
  })
})