import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysisObject } from '../../analysis-object'
import { ANALYSIS_OBJECT_STORAGE_KEY } from '../../analysis-object-store'
import { VIEWER_IDENTITY_STORAGE_KEY } from '../../viewer-identity'
import sidepanelHtml from '../../../entrypoints/sidepanel/index.html?raw'
import type { AnalysisResult } from '../analysis-client'
import { renderBubbleViews } from '../analysis-view'
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
  open = false
  /** 真 DOM 的元素名：测试按标签读语义，不靠子节点位置猜结构。 */
  tagName = 'DIV'
  attributes = new Map<string, string>()
  /** 面板按 dataset.view 标出分区的视图类型，测试也按它读回，不比对 HTML 长相。 */
  dataset: Record<string, string> = {}
  children: Node[] = []
  listeners = new Map<string, (event: { preventDefault(): void }) => void>()
  /** 定位到对应分区：点内嵌视图入口之后，被滚到眼前的应该是那个分区。 */
  scrolledIntoView = false
  tabIndex = 0
  scrollIntoView() { this.scrolledIntoView = true }
  focus() {}
  /** 真 DOM 有元素级选择器；面板按分区身份（[data-view=…]）在抽屉里找目标分区，这里同样支持。 */
  querySelector(selector: string): Node | null {
    const attribute = /^\[data-view="([^"]+)"\]$/.exec(selector)?.[1]
    if (attribute === undefined) return null
    return walk(this).find((item) => item !== this && item.dataset.view === attribute) ?? null
  }
  #text: string | null = null
  /**
   * 与真实 DOM 一样：设过文本就返回它，否则拼起子节点的文本。
   * 少了这一条，读一个容器的字就得逐层猜结构，测试会变成对 HTML 长相的断言。
   */
  get textContent(): string {
    return this.#text ?? this.children.map((child) => child.textContent).join('')
  }
  set textContent(value: string) { this.#text = value }
  append(...nodes: Node[]) { this.children.push(...nodes) }
  replaceChildren(...nodes: Node[]) { this.children = nodes }
  setAttribute(name: string, value: string) { this.attributes.set(name, value) }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null }
  addEventListener(type: string, callback: (event: { preventDefault(): void }) => void) { this.listeners.set(type, callback) }
  dispatch(type: string) { this.listeners.get(type)?.({ preventDefault() {} }) }
}

const answer: AnalysisResult = { kind: 'answer', response: { ok: true, answer: { facts: ['private finding'], inferences: [], citations: [] }, view: { schemaVersion: 1, views: ['object-summary'] } } }
/**
 * 带引用的回答：编号由渲染层按来源清单的序号生成，所以事实里的值与来源清单里的值是同一份。
 */
const citedAnswer: AnalysisResult = { kind: 'answer', response: { ok: true, answer: {
  facts: ['前台价格是 19.99 美元。', '评论样本 120 条。'],
  inferences: ['先看低星问题。'],
  citations: [
    { id: 'object.price', label: '前台价格', value: '19.99', source: 'storefront' },
    { id: 'reviews.sampled', label: '评论样本数', value: '120', source: 'sellersprite' },
  ],
}, view: { schemaVersion: 1, views: ['object-summary'] } } }
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

/** 对话串里的气泡。空态与气泡是同一处的两种形态，读法也统一按 dataset 走。 */
const bubbles = (kind?: string): Node[] => node('#analysis-thread').children
  .filter((child) => kind === undefined || child.dataset.bubble === kind)

/** 一个气泡里的某个分区，身份是 dataset.section。 */
const sectionOf = (bubble: Node, section: string): Node | undefined =>
  bubble.children.find((child) => child.dataset.section === section)

/** 一个容器里渲染出的某个视图，身份是 dataset.view（与抽屉分区同一套身份）。 */
const viewOf = (container: Node, view: string): Node | undefined =>
  walk(container).find((item) => item !== container && item.dataset.view === view)

/** 按标签取一个节点下的所有元素：读语义（标题、列表、条目），不按子节点位置。 */
const tagged = (value: Node | undefined, tag: string): Node[] => value === undefined
  ? []
  : walk(value).filter((item) => item !== value && item.tagName === tag)

/** 一个节点下的标题文字（视图或分区都靠它认出自己是什么）。 */
const titleOf = (value: Node | undefined, tag = 'H3'): string | undefined =>
  tagged(value, tag)[0]?.textContent

/** 一个分区里的条目文字。 */
const entriesOf = (bubble: Node, section: string): Node[] => tagged(sectionOf(bubble, section), 'LI')

/** 一句事实末尾的引用标号：sup 的数字就是底部来源清单里的序号。 */
const marksOf = (bubble: Node, section: string): string[][] => entriesOf(bubble, section)
  .map((item) => tagged(item, 'SUP').map((sup) => sup.textContent))

/** 底部来源清单里的一条：序号、标签、值（值里带着来源名）。 */
const sourceLine = (item: Node): string[] => ['B', 'SPAN', 'I'].map((tag) => tagged(item, tag)[0]?.textContent ?? '')

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
    createElement: (tag: string) => { const value = new Node(); value.tagName = tag.toUpperCase(); return value },
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
    renderBubbleViews(
      document,
      container as unknown as HTMLElement,
      { schemaVersion: 1, views: ['made-up', 'chart-magic'] as never },
      evidence,
      () => {},
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
    renderBubbleViews(document, container as unknown as HTMLElement, { schemaVersion: 1, views: ['keyword-summary'] }, evidence, () => {})
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
    renderBubbleViews(document, container as unknown as HTMLElement, { schemaVersion: 1, views: ['review-pain-points'] }, evidence, () => {})
    // 要评论痛点但证据里没有评论：降级回可用的视图，第一个是前台基础信息。
    expect(titleOf(viewOf(container, 'object-summary'), 'H3')).toBe('前台基础信息')
    evidence.reviews = { sampled: 0, total: 0, coverage: 0, lowStarCount: 0, sampleSufficient: false, painPoints: [] }
    renderBubbleViews(document, container as unknown as HTMLElement, { schemaVersion: 1, views: ['review-pain-points'] }, evidence, () => {})
    const review = viewOf(container, 'review-summary')
    expect(titleOf(review, 'H3')).toBe('评论概览')
    // 样本不足与没读到评论总数都要明说，不能给一个确定的痛点结论。
    expect(review!.textContent).toContain('未返回评论总数')
    expect(review!.textContent).toContain('样本不足')
  })

  it('preserves the previous answer and offers retry when a question fails', async () => {
    mocks.ask.mockResolvedValueOnce(answer).mockResolvedValueOnce({ kind: 'failed', reason: 'unavailable' })
    node('#analysis-question').value = '第一问？'
    node('#analysis-form').dispatch('submit')
    await settle()
    expect(bubbles('answer')).toHaveLength(1)
    node('#analysis-question').value = '失败的一问？'
    node('#analysis-form').dispatch('submit')
    await settle()
    // 失败的一轮不清空对话：上一轮的问答还在，只是多出一个重试入口。
    expect(bubbles('question')).toHaveLength(2)
    expect(bubbles('answer')).toHaveLength(1)
    expect(entriesOf(bubbles('answer')[0]!, 'facts')[0]?.textContent).toBe('private finding')
    expect(node('#analysis-retry').hidden).toBe(false)
    // 重试接着失败的那一轮问句，而不是用户后来打进输入框的内容。
    node('#analysis-question').value = '改成别的了'
    mocks.ask.mockResolvedValue(answer)
    node('#analysis-retry').dispatch('click')
    await settle()
    expect(mocks.ask.mock.calls[2]![0]).toBe('失败的一问？')
    expect(bubbles('question').map((bubble) => bubble.textContent)).toEqual(['第一问？', '失败的一问？'])
    expect(bubbles('answer')).toHaveLength(2)
  })

  it('clears an existing answer immediately on a group change', async () => {
    mocks.ask.mockResolvedValue(answer)
    node('#analysis-form').dispatch('submit')
    await settle()
    stored[VIEWER_IDENTITY_STORAGE_KEY] = { token: 'Bob-token' }
    changed({ [VIEWER_IDENTITY_STORAGE_KEY]: {} }, 'local')
    expect(bubbles()).toHaveLength(0)
    await settle()
  })

  it('切换分析对象时对话串同步清空', async () => {
    mocks.ask.mockResolvedValue(answer)
    node('#analysis-form').dispatch('submit')
    await settle()
    expect(bubbles('answer')).toHaveLength(1)
    stored[ANALYSIS_OBJECT_STORAGE_KEY] = createAnalysisObject({ asin: 'B0ZYXWVUTS', market: 'US', source: 'manual', owner: null, group: null })
    changed({ [ANALYSIS_OBJECT_STORAGE_KEY]: {} }, 'local')
    // 与抽屉一样是同步清屏：上一个对象的问题与回答不得留在新对象的第一屏。
    expect(bubbles()).toHaveLength(0)
    await settle()
    expect(bubbles()).toHaveLength(0)
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
    expect(bubbles('answer')).toHaveLength(0)
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
    expect(bubbles('answer')).toHaveLength(0)
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
    expect(bubbles('answer')).toHaveLength(1)
    // 退出：密钥被清掉后，屏幕上不能再留着上一身份的记录与回答。
    stored[VIEWER_IDENTITY_STORAGE_KEY] = null
    changed({ [VIEWER_IDENTITY_STORAGE_KEY]: {} }, 'local')
    await settle()
    expect(bubbles()).toHaveLength(0)
    expect(node('#record-owner').textContent).toBe('')
    expect(node('#record-note').textContent).toContain('需要访问密钥')
    expect(node('#identity').hidden).toBe(false)
  })
})

describe('对话串', () => {
  it('提问与回答各占一个气泡，事实与推断分区分明', async () => {
    mocks.ask.mockResolvedValue(citedAnswer)
    node('#analysis-question').value = '这个 ASIN 现在最需要关注什么？'
    node('#analysis-form').dispatch('submit')
    await settle()
    const questions = bubbles('question')
    const answers = bubbles('answer')
    expect(questions).toHaveLength(1)
    expect(answers).toHaveLength(1)
    expect(questions[0]!.textContent).toBe('这个 ASIN 现在最需要关注什么？')
    expect(titleOf(sectionOf(answers[0]!, 'facts'))).toBe('事实')
    expect(titleOf(sectionOf(answers[0]!, 'inferences'))).toBe('结论与判断')
    expect(entriesOf(answers[0]!, 'inferences')[0]?.textContent).toBe('先看低星问题。')
  })

  it('句中标号按来源清单顺序生成，与底部来源清单一一对应', async () => {
    mocks.ask.mockResolvedValue(citedAnswer)
    node('#analysis-form').dispatch('submit')
    await settle()
    const bubble = bubbles('answer')[0]!
    // 模型只给事实与它引用的来源 ID；1、2 是渲染层按来源清单序号贴上去的。
    expect(marksOf(bubble, 'facts')).toEqual([['1'], ['2']])
    expect(marksOf(bubble, 'inferences')).toEqual([[]])
    // 来源清单按序号列出标签、值与来自哪里：用户据此核对这句话依据的是哪个字段。
    expect(sectionOf(bubble, 'sources')!.children.map(sourceLine)).toEqual([
      ['1', '前台价格', '19.99（亚马逊前台）'],
      ['2', '评论样本数', '120（SellerSprite）'],
    ])
  })

  it('空态给出引导语、可点的问题建议与一行数据状态', async () => {
    expect(node('#analysis-empty').hidden).toBe(false)
    // 一行数据状态：说到词位与评论各自读到什么，读取入口就在这一处。
    expect(node('#analysis-data-status').textContent).toContain('词位')
    expect(node('#analysis-data-status').textContent).toContain('还没有读取评论')
    const suggests = node('#analysis-suggests').children
    expect(suggests.length).toBeGreaterThan(0)
    suggests[0]!.dispatch('click')
    // 建议是可点的问题，点一下就把问题写进输入框，用户不必自己再打一遍。
    expect(node('#analysis-question').value).toBe(suggests[0]!.textContent)
    // 还没读词位时，第一条建议就是问自然位——建议按已读到的数据给。
    expect(node('#analysis-question').value).toContain('自然位')
  })

  it('读取评论后数据状态改口，空态里的读取入口与抽屉里的是同一条取数路径', async () => {
    node('#analysis-load-reviews').dispatch('click')
    await settle()
    expect(mocks.reviews).toHaveBeenCalledOnce()
    expect(node('#analysis-data-status').textContent).toContain('评论样本')
    expect(node('#analysis-data-status').textContent).not.toContain('还没有读取评论')
  })

  it('有了回答就不再显示空态，建议与数据状态跟着变', async () => {
    mocks.ask.mockResolvedValue(answer)
    node('#load-positions').dispatch('click')
    await settle()
    expect(node('#analysis-data-status').textContent).toContain('词位')
    expect(node('#analysis-data-status').textContent).not.toContain('还没有读取词位')
    node('#analysis-form').dispatch('submit')
    await settle()
    expect(node('#analysis-empty').hidden).toBe(true)
  })

  it('气泡里的内嵌视图入口展开抽屉并定位到对应分区', async () => {
    mocks.positions.mockResolvedValue({
      kind: 'rows',
      rows: [keywordRow('长尾词')],
      summary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 0, sourceTypeCounts: [] },
      cached: false,
      ageMs: 0,
    })
    node('#load-positions').dispatch('click')
    await settle()
    mocks.ask.mockResolvedValue({ kind: 'answer', response: {
      ok: true,
      answer: citedAnswer.response.answer,
      view: { schemaVersion: 1, views: ['object-summary', 'keyword-table'] },
    } })
    node('#analysis-form').dispatch('submit')
    await settle()
    const bubble = bubbles('answer')[0]!
    const entry = sectionOf(bubble, 'views')!.children.find((child) => child.dataset.entry === 'keyword-table')!
    expect(entry.textContent).toBe('查看关键词明细（1 条）')
    expect(node('#drawer-body').hidden).toBe(true)
    entry.dispatch('click')
    expect(node('#drawer-body').hidden).toBe(false)
    // 定位到对应分区：展开之后被滚到眼前的就是那个分区，用户不用自己找。
    expect(node('#drawer-views').children.find((child) => child.dataset.view === 'keyword-table')!.scrolledIntoView).toBe(true)
  })

  it('内嵌视图按视图规格渲染摘要，整表留在抽屉里', async () => {
    mocks.positions.mockResolvedValue({
      kind: 'rows',
      rows: [keywordRow('长尾词')],
      summary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 0, sourceTypeCounts: [] },
      cached: false,
      ageMs: 0,
    })
    node('#load-positions').dispatch('click')
    await settle()
    mocks.ask.mockResolvedValue({ kind: 'answer', response: {
      ok: true,
      answer: citedAnswer.response.answer,
      view: { schemaVersion: 1, views: ['object-summary', 'keyword-summary', 'keyword-table', 'made-up'] as never },
    } })
    node('#analysis-form').dispatch('submit')
    await settle()
    const views = sectionOf(bubbles('answer')[0]!, 'views')!.children
    // 未知类型被忽略；概览卡就地渲染；词位表这类宽表不进气泡，只留一个指向抽屉分区的入口。
    expect(views.map((view) => view.dataset.view ?? view.dataset.entry))
      .toEqual(['object-summary', 'keyword-summary', 'keyword-table'])
    // 宽表是入口不是视图：它只带 dataset.entry，点了才展开抽屉里的那个分区。
    expect(views.find((view) => view.dataset.entry === 'keyword-table')?.dataset.view).toBeUndefined()
    // 抽屉里确实有它指向的那个分区，入口不会指向一个不存在的地方。
    expect(drawerSections()).toContain('keyword-table')
  })

  it('规格与数据不匹配时降级为表格：要趋势但趋势读不到，气泡改成指向表格的入口', async () => {
    // 词位只给一行没有趋势样本的关键词：规格里的 keyword-trend 落到表格上。
    mocks.positions.mockResolvedValue({
      kind: 'rows',
      rows: [keywordRow('长尾词')],
      summary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 0, sourceTypeCounts: [] },
      cached: false,
      ageMs: 0,
    })
    node('#load-positions').dispatch('click')
    await settle()
    mocks.ask.mockResolvedValue({ kind: 'answer', response: {
      ok: true,
      answer: citedAnswer.response.answer,
      view: { schemaVersion: 1, views: ['keyword-trend'] },
    } })
    node('#analysis-form').dispatch('submit')
    await settle()
    const views = sectionOf(bubbles('answer')[0]!, 'views')!.children
    expect(views.map((view) => view.dataset.view ?? view.dataset.entry)).toEqual(['keyword-table'])
    expect(views[0]!.textContent).toBe('查看关键词明细（1 条）')
  })

  it('数据换掉之后，旧气泡的入口不会点了没反应', async () => {
    // 提问时读了词位，气泡里因此有词位表入口。
    mocks.positions.mockResolvedValue({
      kind: 'rows',
      rows: [keywordRow('长尾词')],
      summary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 0, sourceTypeCounts: [] },
      cached: false,
      ageMs: 0,
    })
    node('#load-positions').dispatch('click')
    await settle()
    mocks.ask.mockResolvedValue({ kind: 'answer', response: {
      ok: true,
      answer: citedAnswer.response.answer,
      view: { schemaVersion: 1, views: ['keyword-table'] },
    } })
    node('#analysis-form').dispatch('submit')
    await settle()
    const entry = tagged(sectionOf(bubbles('answer')[0]!, 'views'), 'BUTTON')[0]!
    // 之后词位读取失败，抽屉里不再有这个分区。
    mocks.positions.mockResolvedValue({ kind: 'failed', reason: 'TARGET_UNAVAILABLE', cached: false, ageMs: 0 })
    node('#load-positions').dispatch('click')
    await settle()
    entry.dispatch('click')
    expect(node('#drawer-body').hidden).toBe(false)
    expect(node('#analysis-status').textContent).toContain('已经不是提问时的')
  })
})

describe('真实标记下的对话串', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.unstubAllGlobals()
    document.body.innerHTML = sidepanelHtml.replace(/^[\s\S]*?<body>/, '').replace(/<\/body>[\s\S]*$/, '')
    vi.stubGlobal('browser', { storage: {
      local: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: () => {} },
    } })
    await import('../../../entrypoints/sidepanel/main')
    await settle()
  })

  it('对话串与空态都在标记里，且气泡容器只在对话区内', () => {
    for (const id of ['#analysis-thread', '#analysis-empty', '#analysis-suggests', '#analysis-data-status', '#analysis-load-positions', '#analysis-load-reviews']) {
      expect(document.querySelectorAll(id).length, id + ' 应恰好有一个').toBe(1)
    }
    // 旧的气泡外回答区已经并进对话串，标记里不该再有两份。
    for (const id of ['#analysis-answer', '#analysis-facts', '#analysis-inferences', '#analysis-citations', '#analysis-views']) {
      expect(document.querySelectorAll(id).length, id + ' 应已并进对话串').toBe(0)
    }
  })

  it('空态在真实文档里带引导语，读取入口与它们在同一个区里', () => {
    const empty = document.querySelector<HTMLElement>('#analysis-empty')!
    expect(empty.hidden).toBe(false)
    expect(empty.textContent).toContain('就当前 ASIN 提问')
    for (const id of ['#analysis-suggests', '#analysis-data-status', '#analysis-load-positions']) {
      expect(empty.querySelector(id), id + ' 应在空态里').not.toBeNull()
    }
  })
})
describe('追问带上文', () => {
  it('carries the earlier questions and answers as history, and leaves the evidence out of it', async () => {
    mocks.ask.mockResolvedValue(citedAnswer)
    node('#analysis-question').value = '它主要靠广告撑着吗？'
    node('#analysis-form').dispatch('submit')
    await settle()
    node('#analysis-question').value = '那长尾词呢？'
    node('#analysis-form').dispatch('submit')
    await settle()

    // 第一问没有上文可带。
    expect(mocks.ask.mock.calls[0]![2]).toEqual({ history: [] })
    // 第二问带上第一轮的问答文本：只有事实与判断，证据包不在里面。
    expect(mocks.ask.mock.calls[1]![2]).toEqual({ history: [{
      question: '它主要靠广告撑着吗？',
      facts: citedAnswer.response.answer.facts,
      inferences: citedAnswer.response.answer.inferences,
    }] })
    // 每轮请求仍只发当前证据包，历史里没有第二个证据包。
    expect(JSON.stringify(mocks.ask.mock.calls[1]![2])).not.toContain('asin')
  })

  it('grows the history in conversation order as each turn is answered', async () => {
    mocks.ask.mockResolvedValue(citedAnswer)
    for (const question of ['第一问？', '第二问？']) {
      node('#analysis-question').value = question
      node('#analysis-form').dispatch('submit')
      await settle()
    }
    // 面板按对话串的顺序给出各轮，条数上限由客户端那一侧统一裁（那里才知道出站请求的形状）。
    expect((mocks.ask.mock.calls[1]![2] as { history: Array<{ question: string }> }).history.map((turn) => turn.question))
      .toEqual(['第一问？'])
  })

  it('does not carry an unanswered or failed turn as context', async () => {
    mocks.ask.mockResolvedValueOnce({ kind: 'failed', reason: 'unavailable' }).mockResolvedValue(citedAnswer)
    node('#analysis-question').value = '失败的一问？'
    node('#analysis-form').dispatch('submit')
    await settle()
    node('#analysis-question').value = '接着问？'
    node('#analysis-form').dispatch('submit')
    await settle()
    // 没有回答的那一轮进不了历史：上下文里只有事实与判断，不能凭空给模型一句它没说过的话。
    expect(mocks.ask.mock.calls[1]![2]).toEqual({ history: [] })
  })

  it('clears the history together with the conversation when the analysis object changes', async () => {
    mocks.ask.mockResolvedValue(citedAnswer)
    node('#analysis-question').value = '第一问？'
    node('#analysis-form').dispatch('submit')
    await settle()
    stored[ANALYSIS_OBJECT_STORAGE_KEY] = createAnalysisObject({ asin: 'B0ZYXWVUTS', market: 'US', source: 'manual', owner: null, group: null })
    changed({ [ANALYSIS_OBJECT_STORAGE_KEY]: {} }, 'local')
    await settle()
    node('#analysis-question').value = '新对象第一问？'
    node('#analysis-form').dispatch('submit')
    await settle()
    // 换对象即清空对话：上一个对象的问答不能成为新对象的上下文。
    expect(mocks.ask.mock.calls[1]![2]).toEqual({ history: [] })
  })
})
