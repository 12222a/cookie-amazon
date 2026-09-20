import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysisObject } from '../../analysis-object'
import { ANALYSIS_OBJECT_STORAGE_KEY } from '../../analysis-object-store'
import { VIEWER_IDENTITY_STORAGE_KEY } from '../../viewer-identity'
import sidepanelHtml from '../../../entrypoints/sidepanel/index.html?raw'
import type { AnalysisResult } from '../analysis-client'
import { renderAnalysisViews } from '../analysis-view'
import { buildAnalysisEvidence } from '../analysis-evidence'

const mocks = vi.hoisted(() => ({ ask: vi.fn(), positions: vi.fn(), reviews: vi.fn(), find: vi.fn(), save: vi.fn() }))
vi.mock('../analysis-client', () => ({ askAnalysis: mocks.ask }))
vi.mock('../keyword-position-cache-client', () => ({ requestKeywordPositionsCached: mocks.positions }))
vi.mock('../review-comments-client', () => ({ fetchSellerSpriteReviews: mocks.reviews }))
// 研究记录现在走服务端，面板只依赖这个客户端的判定结果。
vi.mock('../research-record-client', () => ({
  ResearchRecordClient: class {
    public find(...args: unknown[]) { return mocks.find(...args) }
    public save(...args: unknown[]) { return mocks.save(...args) }
  },
  describeRecordResult: (result: { kind: string; message?: string }) =>
    result.kind === 'unauthenticated' ? '需要访问密钥'
      : result.kind === 'unavailable' ? '暂时无法连接研究记录服务'
        : result.kind === 'forbidden' ? (result.message ?? '只有作者本人能改')
          : null,
}))

// A small DOM double keeps this test at the panel's event/storage boundary.
class Node {
  hidden = false
  disabled = false
  value = ''
  textContent = ''
  open = false
  attributes = new Map<string, string>()
  /** 面板按 dataset.view 标出分区的视图类型，测试也按它读回，不比对 HTML 长相。 */
  dataset: Record<string, string> = {}
  children: Node[] = []
  listeners = new Map<string, (event: { preventDefault(): void }) => void>()
  append(...nodes: Node[]) { this.children.push(...nodes) }
  replaceChildren(...nodes: Node[]) { this.children = nodes }
  setAttribute(name: string, value: string) { this.attributes.set(name, value) }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null }
  addEventListener(type: string, callback: (event: { preventDefault(): void }) => void) { this.listeners.set(type, callback) }
  dispatch(type: string) { this.listeners.get(type)?.({ preventDefault() {} }) }
}

const answer: AnalysisResult = { kind: 'answer', response: { ok: true, answer: { facts: ['private finding'], inferences: [], citations: [] }, view: { schemaVersion: 1, views: ['object-summary'] } } }
let nodes: Map<string, Node>
let stored: Record<string, unknown>
let changed: (changes: Record<string, unknown>, area: string) => void
const node = (id: string): Node => nodes.get(id)!
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }

const walk = (value: Node): Node[] => [value, ...value.children.flatMap(walk)]
const textsOf = (value: Node): string[] => walk(value).map((item) => item.textContent)

/** 抽屉里的分区：读证据渲染的那些挂在 #drawer-views 下，研究记录分区是静态节点。 */
const partitions = (): Node[] => [
  ...node('#drawer-views').children,
  ...(nodes.has('#record') ? [node('#record')] : []),
]

/** 抽屉里当前可见的分区，身份是它对应的视图类型。 */
const drawerSections = (): string[] => partitions()
  .flatMap((item) => !item.hidden && item.dataset.view ? [item.dataset.view] : [])

/** 抽屉里看得见的字：分区内容由同一份证据包渲染，两处不会出现不同数字。 */
const drawerText = (): string => partitions()
  .flatMap((item) => item.hidden ? [] : walk(item))
  .map((item) => item.textContent)
  .join('|')

const keywordRow = (keyword: string): unknown => ({
  keyword,
  natural: '第 1 页 · 12',
  ad: '—',
  naturalShare: '4.2%',
  adShare: '—',
  types: '自然搜索词',
  trend: { kind: 'unavailable' },
})

beforeEach(async () => {
  vi.resetModules()
  mocks.ask.mockReset()
  mocks.positions.mockReset().mockResolvedValue({ kind: 'rows', rows: [], summary: { totalKeywords: 0, rankedKeywords: 0, adKeywords: 0, sourceTypeCounts: [] }, cached: false, ageMs: 0 })
  mocks.reviews.mockReset().mockResolvedValue({ kind: 'data', data: { items: [], total: 0 } })
  mocks.find.mockReset().mockResolvedValue({ kind: 'none' })
  // 保存成功返回 found（服务端返回写入后的记录），none 不是写入结果。
  mocks.save.mockReset().mockResolvedValue({
    kind: 'found',
    record: { asin: 'B0ABCDEFGH', market: 'US', owner: 'Alice', group: 'A', status: 'verified', summary: '', updatedAt: 1_700_000_000_000 },
  })
  nodes = new Map()
  stored = {
    [ANALYSIS_OBJECT_STORAGE_KEY]: createAnalysisObject({ asin: 'B0ABCDEFGH', market: 'US', source: 'manual', owner: null, group: null }),
    [VIEWER_IDENTITY_STORAGE_KEY]: { token: 'Alice-token' },
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

/**
 * DOM double 认不出标记里少了一个 id、少了 data-view，或哪个分区藏在抽屉外面——
 * 这些正是这次改动最容易出错的地方。这个用例用真实的 sidepanel 标记跑一遍面板。
 */
describe('侧边栏真实标记', () => {
  beforeEach(async () => {
    vi.resetModules()
    // 丢掉 DOM double，改用 vitest 环境给的真实文档。
    vi.unstubAllGlobals()
    document.body.innerHTML = sidepanelHtml.replace(/^[\s\S]*?<body>/, '').replace(/<\/body>[\s\S]*$/, '')
    vi.stubGlobal('browser', { storage: {
      local: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: () => {} },
    } })
    await import('../../../entrypoints/sidepanel/main')
    await settle()
  })

  it('抽屉默认收起，点一下展开，再点收起', () => {
    const body = document.querySelector<HTMLElement>('#drawer-body')!
    const toggle = document.querySelector<HTMLButtonElement>('#drawer-toggle')!
    expect(body.hidden).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    toggle.click()
    expect(body.hidden).toBe(false)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    toggle.click()
    expect(body.hidden).toBe(true)
  })

  it('读取入口和数据状态都在抽屉里，展开就能看到', () => {
    const drawer = document.querySelector<HTMLElement>('#drawer-body')!
    for (const id of ['#load-positions', '#positions-status', '#load-reviews', '#reviews-status', '#drawer-views']) {
      // 用出现次数而不是 querySelector：重复的 id 会让 querySelector 拿到同一个节点，看不出重复。
      expect(drawer.querySelectorAll(id).length, id + ' 应恰好有一个，且在抽屉内').toBe(1)
      expect(document.querySelectorAll(id).length, id + ' 不应在抽屉外重复出现').toBe(1)
    }
  })
})

describe('analysis panel lifecycle', () => {
  it('打开抽屉才看数据：默认收起，可主动展开与收起，且不写存储', () => {
    expect(node('#drawer-body').hidden).toBe(true)
    expect(node('#drawer-toggle').getAttribute('aria-expanded')).toBe('false')
    const storedBefore = JSON.stringify(stored)
    node('#drawer-toggle').dispatch('click')
    expect(node('#drawer-body').hidden).toBe(false)
    expect(node('#drawer-toggle').getAttribute('aria-expanded')).toBe('true')
    node('#drawer-toggle').dispatch('click')
    expect(node('#drawer-body').hidden).toBe(true)
    expect(node('#drawer-toggle').getAttribute('aria-expanded')).toBe('false')
    // 展开状态只在本次会话内保留：开关抽屉不留任何可跨会话恢复的痕迹。
    expect(JSON.stringify(stored)).toBe(storedBefore)
  })

  it('抽屉分区与视图类型一一对应：只有证据里有的类型才出现分区', async () => {
    expect(drawerSections()).toEqual(['object-summary', 'research-record'])
    mocks.positions.mockResolvedValue({
      kind: 'rows',
      rows: [keywordRow('长尾词'), keywordRow('泛词')],
      summary: { totalKeywords: 2, rankedKeywords: 2, adKeywords: 0, sourceTypeCounts: [] },
      cached: false,
      ageMs: 0,
    })
    node('#load-positions').dispatch('click')
    await settle()
    // 没读评论，就没有评论的两个分区；分区集合由证据里的可用类型决定。
    expect(drawerSections()).toEqual(['object-summary', 'keyword-summary', 'keyword-table', 'research-record'])
  })

  it('未知视图类型被忽略，不崩溃也不多出分区', () => {
    const object = createAnalysisObject({ asin: 'B0ABCDEFGH', market: 'US', source: 'manual', owner: null, group: null })!
    const evidence = buildAnalysisEvidence({ object })
    const container = new Node()
    renderAnalysisViews(
      document,
      container as unknown as HTMLElement,
      { schemaVersion: 1, views: ['made-up', 'chart-magic'] as never },
      evidence,
    )
    expect(container.children.map((view) => view.dataset.view)).toEqual(['object-summary'])
  })

  it('词位概览带上来源类型分布：收进抽屉不等于丢掉数据', () => {
    const object = createAnalysisObject({ asin: 'B0ABCDEFGH', market: 'US', source: 'manual', owner: null, group: null })!
    const evidence = buildAnalysisEvidence({
      object,
      keywordRows: [keywordRow('长尾词')] as never,
      keywordSummary: {
        totalKeywords: 12,
        rankedKeywords: 9,
        adKeywords: 3,
        sourceTypeCounts: [{ code: 'NT', label: '自然搜索词', count: 9 }],
      },
    })
    const container = new Node()
    renderAnalysisViews(document, container as unknown as HTMLElement, { schemaVersion: 1, views: ['keyword-summary'] }, evidence)
    expect(textsOf(container)).toContain('自然搜索词')
    expect(textsOf(container)).toContain('9')
  })

  it('抽屉与对话共用同一份证据包：同一个数在两处一致，且不重复取数', async () => {
    mocks.positions.mockResolvedValue({
      kind: 'rows',
      rows: [keywordRow('长尾词')],
      summary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 0, sourceTypeCounts: [] },
      cached: false,
      ageMs: 0,
    })
    node('#load-positions').dispatch('click')
    await settle()
    mocks.ask.mockResolvedValue(answer)
    const fetchesBeforeAsking = mocks.positions.mock.calls.length
    node('#analysis-form').dispatch('submit')
    await settle()
    const sent = mocks.ask.mock.calls[0]![1] as { keyword: { rows: Array<{ keyword: string; natural: string }> } }
    expect(sent.keyword.rows[0]!.keyword).toBe('长尾词')
    expect(drawerText()).toContain('长尾词')
    // 同一个数在两处一致：问出去的那一行，就是抽屉里显示的那一行。
    expect(sent.keyword.rows[0]!.natural).toBe('第 1 页 · 12')
    expect(drawerText()).toContain('第 1 页 · 12')
    // 提问不另取一份数：对话用的是抽屉里那份证据包。
    expect(mocks.positions.mock.calls.length).toBe(fetchesBeforeAsking)
  })

  it('切换分析对象时抽屉回到收起，且不再显示上一个对象的数据', async () => {
    // 取数按 ASIN 给不同的结果，测试才能分清「新对象的数据」与「上一个对象的残留」。
    mocks.positions.mockImplementation(async (asin: string) => asin === 'B0ABCDEFGH'
      ? {
          kind: 'rows',
          rows: [keywordRow('长尾词')],
          summary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 0, sourceTypeCounts: [] },
          cached: false,
          ageMs: 0,
        }
      : {
          kind: 'rows',
          rows: [],
          summary: { totalKeywords: 0, rankedKeywords: 0, adKeywords: 0, sourceTypeCounts: [] },
          cached: false,
          ageMs: 0,
        })
    node('#load-positions').dispatch('click')
    await settle()
    node('#drawer-toggle').dispatch('click')
    expect(drawerText()).toContain('长尾词')

    stored[ANALYSIS_OBJECT_STORAGE_KEY] = createAnalysisObject({ asin: 'B0ZYXWVUTS', market: 'US', source: 'manual', owner: null, group: null })
    changed({ [ANALYSIS_OBJECT_STORAGE_KEY]: {} }, 'local')
    // 清屏是同步的：不等新对象的取数回来，旧数据就先离开屏幕。
    expect(node('#drawer-body').hidden).toBe(true)
    expect(drawerText()).not.toContain('长尾词')
    await settle()
    expect(drawerSections()).toEqual(['object-summary', 'research-record'])
  })

  it('切换身份时抽屉回到收起并清空', async () => {
    mocks.positions.mockResolvedValue({
      kind: 'rows',
      rows: [keywordRow('长尾词')],
      summary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 0, sourceTypeCounts: [] },
      cached: false,
      ageMs: 0,
    })
    node('#load-positions').dispatch('click')
    await settle()
    node('#drawer-toggle').dispatch('click')
    stored[VIEWER_IDENTITY_STORAGE_KEY] = { token: 'Bob-token' }
    changed({ [VIEWER_IDENTITY_STORAGE_KEY]: {} }, 'local')
    expect(node('#drawer-body').hidden).toBe(true)
    expect(drawerText()).not.toContain('长尾词')
    await settle()
  })

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
    stored[VIEWER_IDENTITY_STORAGE_KEY] = { token: 'Bob-token' }
    changed({ [VIEWER_IDENTITY_STORAGE_KEY]: {} }, 'local')
    expect(node('#analysis-answer').hidden).toBe(true)
    expect(node('#analysis-facts').children).toHaveLength(0)
    await settle()
  })

  it.each(['identity', 'positions', 'reviews'])('discards an outstanding answer after %s changes', async (kind) => {
    let finish!: (result: AnalysisResult) => void
    mocks.ask.mockImplementation(() => new Promise<AnalysisResult>((resolve) => { finish = resolve }))
    node('#analysis-form').dispatch('submit')
    await settle()
    expect(mocks.ask).toHaveBeenCalledOnce()
    if (kind === 'identity') {
      stored[VIEWER_IDENTITY_STORAGE_KEY] = { token: 'Bob-token' }
      changed({ [VIEWER_IDENTITY_STORAGE_KEY]: {} }, 'local')
    } else node(kind === 'positions' ? '#load-positions' : '#load-reviews').dispatch('click')
    await settle()
    finish(answer)
    await settle()
    expect(node('#analysis-answer').hidden).toBe(true)
    expect(node('#analysis-ask').disabled).toBe(false)
  })

  it('discards an outstanding answer when the saved record changes', async () => {
    let finish!: (result: AnalysisResult) => void
    mocks.ask.mockImplementation(() => new Promise<AnalysisResult>((resolve) => { finish = resolve }))
    node('#analysis-form').dispatch('submit')
    await settle()
    expect(mocks.ask).toHaveBeenCalledOnce()
    // 保存研究记录与提问走同一条作废路径：结论变了，旧回答就不再对应当前证据。
    node('#record-status').value = 'verified'
    node('#record-form').dispatch('submit')
    await settle()
    finish(answer)
    await settle()
    expect(node('#analysis-answer').hidden).toBe(true)
    expect(node('#analysis-ask').disabled).toBe(false)
  })

  it('reloads the record for the new identity instead of leaving the previous one on screen', async () => {
    mocks.find.mockResolvedValue({ kind: 'found', record: { asin: 'B0ABCDEFGH', market: 'US', owner: 'Alice', group: 'A', status: 'verified', summary: 'A 的结论', updatedAt: 1_700_000_000_000 } })
    changed({ [ANALYSIS_OBJECT_STORAGE_KEY]: {} }, 'local')
    await settle()
    expect(node('#record-owner').textContent).toBe('Alice')
    // 换人：服务端会按新密钥返回另一条（或没有）记录。
    mocks.find.mockResolvedValue({ kind: 'none' })
    stored[VIEWER_IDENTITY_STORAGE_KEY] = { token: 'Bob-token' }
    changed({ [VIEWER_IDENTITY_STORAGE_KEY]: {} }, 'local')
    await settle()
    expect(node('#record-owner').textContent).toBe('')
    expect(node('#record-note').textContent).toContain('还没有人研究过')
  })

  it('clears the record and the answer when the key is removed', async () => {
    mocks.ask.mockResolvedValue(answer)
    mocks.find.mockResolvedValue({ kind: 'found', record: { asin: 'B0ABCDEFGH', market: 'US', owner: 'Alice', group: 'A', status: 'verified', summary: 'A 的结论', updatedAt: 1_700_000_000_000 } })
    changed({ [ANALYSIS_OBJECT_STORAGE_KEY]: {} }, 'local')
    await settle()
    expect(node('#record-owner').textContent).toBe('Alice')
    node('#analysis-form').dispatch('submit')
    await settle()
    expect(node('#analysis-answer').hidden).toBe(false)
    // 退出：密钥被清掉后，屏幕上不能再留着上一身份的记录与回答。
    stored[VIEWER_IDENTITY_STORAGE_KEY] = null
    changed({ [VIEWER_IDENTITY_STORAGE_KEY]: {} }, 'local')
    await settle()
    expect(node('#analysis-answer').hidden).toBe(true)
    expect(node('#record-owner').textContent).toBe('')
    expect(node('#record-note').textContent).toContain('需要访问密钥')
    expect(node('#identity').hidden).toBe(false)
  })
})
