import { afterEach, describe, expect, it } from 'vitest'
import { mountOverlay, OVERLAY_HOST_ID, type OverlayHandlers, type OverlayHandle } from '../overlay'
import { createAnalysisObject, type AnalysisObject } from '../../analysis-object'
import { buildAnalysisEvidence } from '../analysis-evidence'
import type { PublishedConversation } from '../conversation-store'

/**
 * 浮层里的对话串（#22）。
 *
 * 读的是外部行为：shadow DOM 里出现了哪条对话、是不是同一个对象的那一条、收起与展开各显示什么，
 * 以及发布的那一份读不出来时浮层怎么办。不比对 HTML 长相，也不比对内部函数调用。
 */
const document = globalThis.document

const object: AnalysisObject = createAnalysisObject({
  asin: 'B07Z82895W', market: 'US', source: 'storefront', now: 1_700_000_000_000,
  storefront: { title: '折叠硅胶瑜伽垫', price: 29.99, rating: 4.3, reviews: 1204, sponsored: false },
})!

const evidence = buildAnalysisEvidence({ object })

/** 侧边栏发布的那一份：同一个对象、同一条对话串、同一份证据包。 */
const publish = (asin = 'B07Z82895W'): PublishedConversation => ({
  asin,
  market: 'US',
  evidence,
  turns: [{
    question: '这个词位结构更依赖自然位还是广告位？',
    answer: {
      response: {
        ok: true,
        answer: {
          facts: ['前台价格是 29.99 美元。'],
          inferences: ['先看低星问题。'],
          citations: [{ id: 'object.price', label: '前台价格', value: '29.99', source: 'storefront' }],
        },
        view: { schemaVersion: 1, views: ['object-summary'] },
      },
      evidence,
    },
  }],
})

let handle: OverlayHandle | null = null

// 真环境里 scrollIntoView 只在有布局时才有作用；测试里只关心它被点名到哪个分区。
Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { scrolledIntoView.add(this) }

const mount = (read: OverlayHandlers['readConversation']): ShadowRoot => {
  handle = mountOverlay(document, {
    onPin: async () => true,
    onToggleCollapsed: () => {},
    onMove: () => {},
    readConversation: read,
  }, { x: 0, y: 0 })
  expect(handle).not.toBeNull()
  return document.getElementById(OVERLAY_HOST_ID)!.shadowRoot!
}

const bubbles = (shadow: ShadowRoot, kind: string): HTMLElement[] =>
  [...shadow.querySelectorAll<HTMLElement>('[data-bubble]')].filter((node) => node.dataset.bubble === kind)

const entries = (shadow: ShadowRoot): HTMLElement[] =>
  [...shadow.querySelectorAll<HTMLElement>('li')]

afterEach(() => { handle?.remove(); handle = null })

describe('浮层里的对话串', () => {
  it('展开态渲染侧边栏那一条对话串：提问与回答气泡都在', () => {
    const shadow = mount(() => publish())
    handle!.render(object, 'card')
    expect(bubbles(shadow, 'question')).toHaveLength(1)
    expect(bubbles(shadow, 'answer')).toHaveLength(1)
    expect(shadow.textContent).toContain('这个词位结构更依赖自然位还是广告位？')
  })

  it('回答里的分区、标号与来源清单与侧边栏同源，因此同一个数只在两处各出现一次', () => {
    const shadow = mount(() => publish())
    handle!.render(object, 'card')
    const bubble = bubbles(shadow, 'answer')[0]!
    expect(bubble.querySelector('[data-section=facts] h3')?.textContent).toBe('事实')
    expect(bubble.querySelector('[data-section=inferences] h3')?.textContent).toBe('结论与判断')
    // 标号是渲染产物：句末的 1 指向来源清单里的第 1 条，两条都来自同一份证据包。
    expect(bubble.querySelector('[data-section=facts] sup')?.textContent).toBe('1')
    expect(bubble.querySelector('[data-section=sources] li b')?.textContent).toBe('1')
    expect(entries(shadow).some((item) => item.textContent?.includes('亚马逊前台'))).toBe(true)
  })

  it('收起态不再显示对话串，展开态再显示回来', () => {
    const shadow = mount(() => publish())
    handle!.render(object, 'card')
    expect(bubbles(shadow, 'question')).toHaveLength(1)
    handle!.render(object, 'pill')
    // 收起态是一颗可再点开的药丸：它不该继续占着对话串的位置。
    expect(bubbles(shadow, 'question')).toHaveLength(0)
    expect(shadow.textContent).toContain('B07Z82895W')
    handle!.render(object, 'card')
    expect(bubbles(shadow, 'question')).toHaveLength(1)
  })

  it('不显示别的对象的对话：发布的那一份不是当前对象时，一条气泡也不留', () => {
    const shadow = mount(() => publish('B0ZYXWVUTS'))
    handle!.render(object, 'card')
    expect(bubbles(shadow, 'question')).toHaveLength(0)
    expect(shadow.textContent).not.toContain('这个词位结构更依赖自然位还是广告位？')
  })

  it('还没有人问过时只显示对象本身，浮层照常可用', () => {
    const shadow = mount(() => null)
    handle!.render(object, 'card')
    expect(bubbles(shadow, 'question')).toHaveLength(0)
    expect(shadow.textContent).toContain('B07Z82895W')
    // 来源与站点仍然写着：这是用户判断「我现在看的是哪来的对象」的依据，去掉它等于丢信息。
    expect(shadow.textContent).toContain('US')
    expect(shadow.textContent).toContain('搜索页选中')
  })

  it('发布的那一份读不出来时不崩、不影响页面，只是没有对话', () => {
    const shadow = mount(() => { throw new Error('storage unavailable') })
    // 读存储失败是信任边界上的事：浮层降级为「没有对话」，不能把异常抛回 Amazon 页面。
    expect(() => handle!.render(object, 'card')).not.toThrow()
    expect(bubbles(shadow, 'question')).toHaveLength(0)
    expect(shadow.textContent).toContain('B07Z82895W')
  })
})

const drawerToggle = (shadow: ShadowRoot): HTMLButtonElement =>
  shadow.querySelector<HTMLButtonElement>('.panel-drawer-toggle')!

const drawerBody = (shadow: ShadowRoot): HTMLElement =>
  drawerToggle(shadow).nextElementSibling as HTMLElement

/**
 * 某个分区有没有被滚到眼前。
 *
 * 与侧边栏同一套语义：分区身份就是视图类型，定位就是把那个分区滚进视野（main.ts 的 openDrawerAt）。
 * 这里只记下被点名的元素，不关心它是怎么滚的。
 */
const scrolledIntoView = new WeakSet<Element>()
const partitionScrolled = (shadow: ShadowRoot, view: string): boolean =>
  partitions(shadow).some((node) => node.dataset.view === view && scrolledIntoView.has(node))

/** 抽屉里的分区身份就是视图类型，与侧边栏是同一套（analysis-view）。 */
const partitions = (shadow: ShadowRoot): HTMLElement[] =>
  [...drawerBody(shadow).querySelectorAll<HTMLElement>('[data-view]')]

describe('浮层里的数据抽屉', () => {
  it('默认收起：展开态先看到对话，数据要点一下才出来', () => {
    const shadow = mount(() => publish())
    handle!.render(object, 'card')
    expect(drawerBody(shadow).hidden).toBe(true)
    expect(drawerToggle(shadow).getAttribute('aria-expanded')).toBe('false')
    drawerToggle(shadow).click()
    expect(drawerBody(shadow).hidden).toBe(false)
    expect(drawerToggle(shadow).getAttribute('aria-expanded')).toBe('true')
  })

  it('抽屉里的分区与侧边栏同一套：由发布的那份证据包决定，没读到的数据不占分区', () => {
    const shadow = mount(() => publish())
    handle!.render(object, 'card')
    drawerToggle(shadow).click()
    // 侧边栏发布时只读了前台信息，所以只有前台基础信息这一个分区。
    expect(partitions(shadow).map((node) => node.dataset.view)).toEqual(['object-summary'])
  })

  it('证据里有研究记录时，浮层的抽屉也带上它——两处的抽屉显示同一批分区', () => {
    const withRecord = {
      ...evidence,
      record: { owner: 'Alice', status: 'verified' as const, summary: '自然位只在前 3 页，先观察', updatedAt: 1_700_000_000_000 },
    }
    const shadow = mount(() => ({
      ...publish(),
      evidence: withRecord,
      turns: publish().turns.map((turn) => turn.answer === null ? turn : { ...turn, answer: { ...turn.answer, evidence: withRecord } }),
    }))
    handle!.render(object, 'card')
    drawerToggle(shadow).click()
    expect(partitions(shadow).map((node) => node.dataset.view)).toEqual(['object-summary', 'research-record'])
    // 浮层不写记录，只把同组已经写下的结论显示出来——数据一致，可写的那份仍在侧边栏。
    expect(shadow.textContent).toContain('自然位只在前 3 页，先观察')
    expect(shadow.querySelector('[data-view=research-record] input, [data-view=research-record] textarea')).toBeNull()
  })

  it('抽屉显示的是发布的那份数据，因此与侧边栏是同一个数', () => {
    const keywords = {
      ...evidence,
      keyword: {
        summary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 0, sourceTypeCounts: [] },
        rows: [{
          keyword: '长尾词', natural: '第 1 页 · 12', ad: '—', naturalShare: '4.2%', adShare: '—',
          types: '自然搜索词', trend: { kind: 'unavailable' as const },
        }],
      },
      object: { ...evidence.object, price: 29.99 },
    }
    const shadow = mount(() => ({ ...publish(), evidence: keywords }))
    handle!.render(object, 'card')
    drawerToggle(shadow).click()
    // 侧边栏读到的行与数在这里原样出现：两处共用一份证据包，不会各算一遍。
    expect(shadow.textContent).toContain('长尾词')
    expect(shadow.textContent).toContain('第 1 页 · 12')
    expect(partitions(shadow).map((node) => node.dataset.view)).toEqual(['object-summary', 'keyword-summary', 'keyword-table'])
  })

  it('气泡里的入口展开抽屉并落到对应分区', () => {
    // 词位表是宽表，在气泡里退成一个指向抽屉的入口（ADR-0005），所以这一轮要有词位数据。
    const withKeywords = {
      ...evidence,
      keyword: {
        summary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 0, sourceTypeCounts: [] },
        rows: [{
          keyword: '长尾词', natural: '第 1 页 · 12', ad: '—', naturalShare: '4.2%', adShare: '—',
          types: '自然搜索词', trend: { kind: 'unavailable' as const },
        }],
      },
    }
    const shadow = mount(() => ({
      ...publish(),
      evidence: withKeywords,
      turns: publish().turns.map((turn) => ({
        ...turn,
        answer: turn.answer === null ? null : {
          ...turn.answer,
          evidence: withKeywords,
          response: { ...turn.answer.response, view: { schemaVersion: 1 as const, views: ['keyword-table' as const] } },
        },
      })),
    }))
    handle!.render(object, 'card')
    expect(drawerBody(shadow).hidden).toBe(true)
    const entry = shadow.querySelector<HTMLButtonElement>('[data-entry=keyword-table]')
    expect(entry, '回答里应有一个指向数据抽屉的入口').not.toBeNull()
    entry!.click()
    expect(drawerBody(shadow).hidden).toBe(false)
    // 入口指向的分区确实在抽屉里，用户点下去不会落到空白处。
    expect(partitions(shadow).map((node) => node.dataset.view)).toContain('keyword-table')
    // 与侧边栏同一套语义：展开之后那个分区被带到眼前，用户不用自己在抽屉里找。
    expect(partitionScrolled(shadow, 'keyword-table')).toBe(true)
  })

  it('入口指向的分区已经不在抽屉里时，抽屉照样展开，用户不会点了没反应', () => {
    // 回答那一轮读了词位（所以气泡里有词位表入口），但此后数据被换掉，
    // 抽屉按当前证据重建时已经没有那个分区了——侧边栏会退到抽屉本身，浮层也要一样。
    const asked = {
      ...evidence,
      keyword: {
        summary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 0, sourceTypeCounts: [] },
        rows: [{
          keyword: '长尾词', natural: '第 1 页 · 12', ad: '—', naturalShare: '4.2%', adShare: '—',
          types: '自然搜索词', trend: { kind: 'unavailable' as const },
        }],
      },
    }
    const shadow = mount(() => ({
      ...publish(),
      turns: publish().turns.map((turn) => turn.answer === null ? turn : {
        ...turn,
        answer: {
          ...turn.answer,
          evidence: asked,
          response: { ...turn.answer.response, view: { schemaVersion: 1 as const, views: ['keyword-table' as const] } },
        },
      }),
    }))
    handle!.render(object, 'card')
    const entry = shadow.querySelector<HTMLButtonElement>('[data-entry=keyword-table]')
    expect(entry, '宽表仍退成入口').not.toBeNull()
    entry!.click()
    // 分区没了，但点击仍然把抽屉打开——与侧边栏一样，用户至少能看到抽屉本身。
    expect(drawerBody(shadow).hidden).toBe(false)
    expect(partitionScrolled(shadow, 'keyword-table')).toBe(false)
  })

  it('收起成药丸再展开时抽屉回到收起，且不留上一次展开的痕迹', () => {
    const shadow = mount(() => publish())
    handle!.render(object, 'card')
    drawerToggle(shadow).click()
    expect(drawerBody(shadow).hidden).toBe(false)
    handle!.render(object, 'pill')
    handle!.render(object, 'card')
    expect(drawerBody(shadow).hidden).toBe(true)
    expect(drawerToggle(shadow).getAttribute('aria-expanded')).toBe('false')
  })
})
