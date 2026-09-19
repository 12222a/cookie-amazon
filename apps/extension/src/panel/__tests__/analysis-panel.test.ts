import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysisObject } from '../../analysis-object'
import { ANALYSIS_OBJECT_STORAGE_KEY } from '../../analysis-object-store'
import { VIEWER_IDENTITY_STORAGE_KEY } from '../../viewer-identity'
import { RESEARCH_RECORDS_STORAGE_KEY } from '../../research-record-store'
import type { AnalysisResult } from '../analysis-client'
import { renderAnalysisViews } from '../analysis-view'
import { buildAnalysisEvidence } from '../analysis-evidence'

const mocks = vi.hoisted(() => ({ ask: vi.fn(), positions: vi.fn(), reviews: vi.fn() }))
vi.mock('../analysis-client', () => ({ askAnalysis: mocks.ask }))
vi.mock('../keyword-position-cache-client', () => ({ requestKeywordPositionsCached: mocks.positions }))
vi.mock('../review-comments-client', () => ({ fetchSellerSpriteReviews: mocks.reviews }))

// A small DOM double keeps this test at the panel's event/storage boundary.
class Node {
  hidden = false
  disabled = false
  value = ''
  textContent = ''
  dataset = {}
  children: Node[] = []
  listeners = new Map<string, (event: { preventDefault(): void }) => void>()
  append(...nodes: Node[]) { this.children.push(...nodes) }
  replaceChildren(...nodes: Node[]) { this.children = nodes }
  addEventListener(type: string, callback: (event: { preventDefault(): void }) => void) { this.listeners.set(type, callback) }
  dispatch(type: string) { this.listeners.get(type)?.({ preventDefault() {} }) }
}

const answer: AnalysisResult = { kind: 'answer', response: { ok: true, answer: { facts: ['private finding'], inferences: [], citations: [] }, view: { schemaVersion: 1, views: ['object-summary'] } } }
let nodes: Map<string, Node>
let stored: Record<string, unknown>
let changed: (changes: Record<string, unknown>, area: string) => void
const node = (id: string): Node => nodes.get(id)!
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }

beforeEach(async () => {
  vi.resetModules()
  mocks.ask.mockReset()
  mocks.positions.mockReset().mockResolvedValue({ kind: 'rows', rows: [], summary: { totalKeywords: 0, rankedKeywords: 0, adKeywords: 0, sourceTypeCounts: [] }, cached: false, ageMs: 0 })
  mocks.reviews.mockReset().mockResolvedValue({ kind: 'data', data: { items: [], total: 0 } })
  nodes = new Map()
  stored = {
    [ANALYSIS_OBJECT_STORAGE_KEY]: createAnalysisObject({ asin: 'B0ABCDEFGH', market: 'US', source: 'manual', owner: null, group: null }),
    [VIEWER_IDENTITY_STORAGE_KEY]: { name: 'Alice', group: 'A' },
  }
  vi.stubGlobal('document', {
    querySelector(id: string) { const value = new Node(); nodes.set(id, value); return value },
    createElement: () => new Node(),
  })
  vi.stubGlobal('browser', { storage: {
    local: { get: async (key: string) => ({ [key]: stored[key] }), set: async (value: Record<string, unknown>) => { Object.assign(stored, value) } },
    onChanged: { addListener(callback: typeof changed) { changed = callback } },
  } })
  await import('../../../entrypoints/sidepanel/main')
  await settle()
  node('#analysis-question').value = 'What is known?'
})

afterEach(() => { vi.unstubAllGlobals() })

describe('analysis panel lifecycle', () => {
  it('renders safe fallback content for missing and insufficient review evidence', () => {
    const object = createAnalysisObject({ asin: 'B0ABCDEFGH', market: 'US', source: 'manual', owner: null, group: null })!
    const evidence = buildAnalysisEvidence({ object })
    const container = new Node()
    renderAnalysisViews(document, container as unknown as HTMLElement, { schemaVersion: 1, views: ['review-pain-points'] }, evidence)
    expect(container.children[0]?.children[0]?.textContent).toBe('前台基础信息')
    evidence.reviews = { sampled: 0, total: 0, coverage: 0, lowStarCount: 0, sampleSufficient: false, painPoints: [] }
    renderAnalysisViews(document, container as unknown as HTMLElement, { schemaVersion: 1, views: ['review-pain-points'] }, evidence)
    const review = container.children[1]!
    expect(review.children[0]?.textContent).toBe('评论概览')
    expect(review.children[2]?.textContent).toContain('未返回评论总数')
    expect(review.children[2]?.textContent).toContain('样本不足')
  })

  it('preserves the previous answer and offers retry when a question fails', async () => {
    mocks.ask.mockResolvedValueOnce(answer).mockResolvedValueOnce({ kind: 'failed', reason: 'unavailable' })
    node('#analysis-form').dispatch('submit')
    await settle()
    expect(node('#analysis-answer').hidden).toBe(false)
    node('#analysis-form').dispatch('submit')
    await settle()
    expect(node('#analysis-facts').children[0]?.textContent).toBe('private finding')
    expect(node('#analysis-retry').hidden).toBe(false)
  })

  it('clears an existing answer immediately on a group change', async () => {
    mocks.ask.mockResolvedValue(answer)
    node('#analysis-form').dispatch('submit')
    await settle()
    stored[VIEWER_IDENTITY_STORAGE_KEY] = { name: 'Bob', group: 'B' }
    changed({ [VIEWER_IDENTITY_STORAGE_KEY]: {} }, 'local')
    expect(node('#analysis-answer').hidden).toBe(true)
    expect(node('#analysis-facts').children).toHaveLength(0)
    await settle()
  })

  it.each(['identity', 'record', 'positions', 'reviews'])('discards an outstanding answer after %s changes', async (kind) => {
    let finish!: (result: AnalysisResult) => void
    mocks.ask.mockImplementation(() => new Promise<AnalysisResult>((resolve) => { finish = resolve }))
    node('#analysis-form').dispatch('submit')
    await settle()
    expect(mocks.ask).toHaveBeenCalledOnce()
    if (kind === 'identity') {
      stored[VIEWER_IDENTITY_STORAGE_KEY] = { name: 'Bob', group: 'B' }
      changed({ [VIEWER_IDENTITY_STORAGE_KEY]: {} }, 'local')
    } else if (kind === 'record') changed({ [RESEARCH_RECORDS_STORAGE_KEY]: {} }, 'local')
    else node(kind === 'positions' ? '#load-positions' : '#load-reviews').dispatch('click')
    await settle()
    finish(answer)
    await settle()
    expect(node('#analysis-answer').hidden).toBe(true)
    expect(node('#analysis-ask').disabled).toBe(false)
  })
})
