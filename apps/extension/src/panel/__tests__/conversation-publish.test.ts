import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysisObject } from '../../analysis-object'
import { ANALYSIS_OBJECT_STORAGE_KEY } from '../../analysis-object-store'
import { VIEWER_IDENTITY_STORAGE_KEY } from '../../viewer-identity'
import { CONVERSATION_STORAGE_KEY, type PublishedConversation } from '../conversation-store'
import sidepanelHtml from '../../../entrypoints/sidepanel/index.html?raw'
import type { AnalysisResult } from '../analysis-client'

/**
 * 侧边栏把对话发布出去（#22 的交接处）。
 *
 * 浮层读的就是这里写下的东西，所以断言的是外部行为：问过之后存储里出现了那条对话、
 * 换对象时它先被清掉、以及面板不会因为自己写的那一条又重渲染一次。
 * 用真实的 sidepanel 标记跑，认不出 id 或容器跑出对话区都会红。
 */
const mocks = vi.hoisted(() => ({ ask: vi.fn(), positions: vi.fn(), reviews: vi.fn(), find: vi.fn(), save: vi.fn() }))
vi.mock('../analysis-client', () => ({ askAnalysis: mocks.ask }))
vi.mock('../keyword-position-cache-client', () => ({ requestKeywordPositionsCached: mocks.positions }))
vi.mock('../review-comments-client', () => ({ fetchSellerSpriteReviews: mocks.reviews }))
vi.mock('../research-record-client', () => ({
  ResearchRecordClient: class {
    public find(...args: unknown[]) { return mocks.find(...args) }
    public save(...args: unknown[]) { return mocks.save(...args) }
  },
  describeRecordResult: () => null,
}))

const answer = (facts: string[]): AnalysisResult => ({
  kind: 'answer',
  response: { ok: true, answer: { facts, inferences: [], citations: [] }, view: { schemaVersion: 1, views: ['object-summary'] } },
})

let stored: Record<string, unknown>
let writes: Array<Record<string, unknown>>
let changed: (changes: Record<string, unknown>, area: string) => void
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }

/** 存储里当前发布的那一份对话。 */
const published = (): PublishedConversation | null =>
  (stored[CONVERSATION_STORAGE_KEY] ?? null) as PublishedConversation | null

const publishedWrites = (): Array<unknown> =>
  writes.filter((items) => CONVERSATION_STORAGE_KEY in items).map((items) => items[CONVERSATION_STORAGE_KEY])

const ask = async (question: string): Promise<void> => {
  document.querySelector<HTMLTextAreaElement>('#analysis-question')!.value = question
  document.querySelector<HTMLFormElement>('#analysis-form')!.dispatchEvent(new Event('submit'))
  await settle()
}

beforeEach(async () => {
  vi.resetModules()
  mocks.ask.mockReset().mockResolvedValue(answer(['前台价格是 29.99 美元。']))
  mocks.positions.mockReset().mockResolvedValue({
    kind: 'rows', rows: [], summary: { totalKeywords: 0, rankedKeywords: 0, adKeywords: 0, sourceTypeCounts: [] },
    cached: false, ageMs: 0,
  })
  mocks.reviews.mockReset().mockResolvedValue({ kind: 'data', data: { items: [], total: 0 } })
  mocks.find.mockReset().mockResolvedValue({ kind: 'none' })
  mocks.save.mockReset().mockResolvedValue({ kind: 'none' })
  writes = []
  stored = {
    [ANALYSIS_OBJECT_STORAGE_KEY]: createAnalysisObject({
      asin: 'B0ABCDEFGH', market: 'US', source: 'manual', owner: null, group: null,
      storefront: { title: '折叠硅胶瑜伽垫', price: 29.99, rating: 4.3, reviews: 1204, sponsored: false },
    }),
    [VIEWER_IDENTITY_STORAGE_KEY]: { token: 'Alice-token' },
  }
  vi.unstubAllGlobals()
  document.body.innerHTML = sidepanelHtml.replace(/^[\s\S]*?<body>/, '').replace(/<\/body>[\s\S]*$/, '')
  vi.stubGlobal('browser', { storage: {
    local: {
      get: async (key: string) => ({ [key]: stored[key] }),
      set: async (items: Record<string, unknown>) => { writes.push(items); Object.assign(stored, items) },
    },
    onChanged: { addListener(callback: typeof changed) { changed = callback } },
  } })
  await import('../../../entrypoints/sidepanel/main')
  await settle()
})

afterEach(() => { vi.unstubAllGlobals() })

describe('侧边栏发布对话给页面内浮层', () => {
  it('问过之后存储里就有这条问答，浮层读到的与侧边栏显示的是同一条', async () => {
    await ask('这个词位结构更依赖自然位还是广告位？')
    const snapshot = published()
    expect(snapshot?.asin).toBe('B0ABCDEFGH')
    expect(snapshot?.turns.map((turn) => turn.question)).toEqual(['这个词位结构更依赖自然位还是广告位？'])
    expect(snapshot?.turns[0]!.answer?.response.answer.facts).toEqual(['前台价格是 29.99 美元。'])
    // 对话里那一条确实长在侧边栏的对话串上：发布的是屏幕上显示的那句，不是另算的一份。
    expect(document.querySelector('#analysis-thread')!.textContent).toContain('前台价格是 29.99 美元。')
  })

  it('发布的证据包与抽屉里的是同一份，两处因此不会出现不同的数字', async () => {
    await ask('这个 ASIN 的前台信息是什么？')
    const snapshot = published()
    expect(snapshot?.evidence?.object.title).toBe('折叠硅胶瑜伽垫')
    // 抽屉里此时有前台基础信息分区，它渲染的就是同一份证据包。
    const drawer = document.querySelector('#drawer-views')!
    expect(drawer.querySelector('[data-view=object-summary]')).not.toBeNull()
    expect(drawer.textContent).toContain('折叠硅胶瑜伽垫')
  })

  it('换对象时先把发布的那一条清掉，浮层不会在新对象下先显示上一个对象的问答', async () => {
    await ask('上一个对象的问题？')
    expect(published()?.turns).toHaveLength(1)
    stored[ANALYSIS_OBJECT_STORAGE_KEY] = createAnalysisObject({
      asin: 'B0ZYXWVUTS', market: 'US', source: 'manual', owner: null, group: null,
    })
    changed({ [ANALYSIS_OBJECT_STORAGE_KEY]: {} }, 'local')
    await settle()
    // 清掉或换成了新对象的空对话，两种都行；关键是上一个对象的那句不再发布出去。
    const snapshot = published()
    const questions = snapshot?.turns.map((turn) => turn.question) ?? []
    expect(questions).not.toContain('上一个对象的问题？')
    expect(snapshot?.asin ?? 'B0ZYXWVUTS').toBe('B0ZYXWVUTS')
  })

  it('面板不会因为自己写的那一条对话又重渲染一次', async () => {
    await ask('这个问题只该问一次？')
    const writesBefore = writes.length
    const askedBefore = mocks.ask.mock.calls.length
    // 真实浏览器里面板自己的写入也会收到 onChanged；把它当成外部变更就会自激。
    changed({ [CONVERSATION_STORAGE_KEY]: {} }, 'local')
    await settle()
    expect(writes.length).toBe(writesBefore)
    expect(mocks.ask.mock.calls.length).toBe(askedBefore)
    expect(document.querySelectorAll('#analysis-thread [data-bubble]').length).toBe(2)
  })

  it('没有对象时发布的是「没有对话」，浮层不会显示别的对象留下的一条', async () => {
    await ask('问过一句？')
    expect(published()).not.toBeNull()
    stored[ANALYSIS_OBJECT_STORAGE_KEY] = null
    changed({ [ANALYSIS_OBJECT_STORAGE_KEY]: {} }, 'local')
    await settle()
    expect(published()).toBeNull()
  })
})
