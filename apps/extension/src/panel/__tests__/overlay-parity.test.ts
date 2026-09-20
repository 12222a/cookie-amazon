import { afterEach, describe, expect, it } from 'vitest'
import { mountOverlay, OVERLAY_HOST_ID, type OverlayHandle } from '../overlay'
import { ConversationStore, CONVERSATION_STORAGE_KEY } from '../conversation-store'
import { renderConversationThread } from '../conversation-view'
import { buildAnalysisEvidence } from '../analysis-evidence'
import { createAnalysisObject } from '../../analysis-object'
import type { StorageArea } from '../../remote-config'

/**
 * 两个壳显示的是同一条对话（#22 的核心）。
 *
 * 断言的是**可观察的等价**：侧边栏写进存储的那一份，原样出现在浮层的 shadow DOM 里——
 * 同一句问、同一句答、同一个标号、同一个来源序号、同一份证据包算出来的分区。
 * 不比对 HTML 长相，也不比对内部调用顺序。
 */
const document = globalThis.document

const object = createAnalysisObject({
  asin: 'B07Z82895W', market: 'US', source: 'storefront', now: 1_700_000_000_000,
  storefront: { title: '折叠硅胶瑜伽垫', price: 29.99, rating: 4.3, reviews: 1204, sponsored: false },
})!

const keywordRow = {
  keyword: 'yoga mat', natural: '第 1 页 · 12', ad: '—', naturalShare: '4.2%', adShare: '—',
  types: '自然搜索词', trend: { kind: 'unavailable' as const },
}

const evidence = buildAnalysisEvidence({
  object,
  keywordRows: [keywordRow] as never,
  keywordSummary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 0, sourceTypeCounts: [] },
})

/** 侧边栏当场渲染的那条对话，与它发布出去的是同一份 thread 值。 */
const thread = [{
  question: '这个词位结构更依赖自然位还是广告位？',
  answer: {
    response: {
      ok: true as const,
      answer: {
        facts: ['前台价格是 29.99 美元。', '反查到的 1 个关键词里有 1 个有自然排名。'],
        inferences: ['自然位只有一条，先按广告位观察。'],
        citations: [
          { id: 'object.price', label: '前台价格', value: '29.99', source: 'storefront' as const },
          { id: 'keyword.summary.ranked', label: '有自然排名', value: '1', source: 'derived' as const },
        ],
      },
      view: { schemaVersion: 1 as const, views: ['object-summary' as const, 'keyword-table' as const] },
    },
    evidence,
  },
}]

let handle: OverlayHandle | null = null

afterEach(() => { handle?.remove(); handle = null })

/**
 * 两侧各自的存储访问面：侧边栏写、浮层读，中间只有一个内存区。
 * 浮层那一侧用的是真的 ConversationStore——交接处不是替身，走的正是产品里那条路。
 */
const memoryStorage = () => {
  const data: Record<string, unknown> = {}
  const area: StorageArea = {
    async get(key) { return { [key]: data[key] } },
    async set(items) { Object.assign(data, items) },
  }
  return { area, data }
}

/** 侧边栏那一侧：把这条对话发布出去。 */
const publish = async (area: StorageArea) => {
  await new ConversationStore(area).write({ asin: object.asin, market: object.market, evidence, turns: thread })
}

/** 浮层那一侧：从同一份存储里读，再挂上浮层渲染——与 entrypoint 的先后一致。 */
const overlaySide = async (area: StorageArea): Promise<ShadowRoot> => {
  const store = new ConversationStore(area)
  // 与 entrypoint 一样：存储是异步的，渲染是同步的，所以先把读到的放进内存。
  const snapshot = await store.read()
  handle = mountOverlay(document, {
    onPin: async () => true,
    onToggleCollapsed: () => {},
    onMove: () => {},
    readConversation: () => snapshot,
  }, { x: 0, y: 0 })
  expect(handle).not.toBeNull()
  handle!.render(object, 'card')
  return document.getElementById(OVERLAY_HOST_ID)!.shadowRoot!
}

/** 侧边栏那一条：同一个渲染器、同一份数据、同一段真实文档。 */
const sidebarRendered = (): HTMLElement => {
  const container = document.createElement('div')
  renderConversationThread(document, container, thread, () => {})
  return container
}

const shape = (root: HTMLElement | ShadowRoot): string[] => {
  const items: string[] = []
  for (const bubble of root.querySelectorAll<HTMLElement>('[data-bubble]')) {
    items.push(bubble.dataset.bubble === 'question' ? '问：' + (bubble.textContent ?? '') : '答')
    if (bubble.dataset.bubble !== 'answer') continue
    for (const line of bubble.querySelectorAll<HTMLElement>('[data-section=facts] li, [data-section=inferences] li')) {
      // 句子 + 它末尾的标号，一起读：标号也是要一致的东西。
      items.push((line.textContent ?? '') + '^' + [...line.querySelectorAll('sup')].map((sup) => sup.textContent).join(','))
    }
    for (const line of bubble.querySelectorAll<HTMLElement>('[data-section=sources] li')) {
      items.push('源：' + (line.querySelector('b')?.textContent ?? '') + ' ' + (line.textContent ?? ''))
    }
  }
  return items
}

describe('侧边栏与浮层显示同一条对话', () => {
  it('侧边栏渲染出来的问答，与浮层从存储里读到并渲染出来的完全一致', async () => {
    const { area, data } = memoryStorage()
    await publish(area)
    // 浮层读的就是侧边栏写下的那一条：先钉住交接处本身。
    expect(await new ConversationStore(area).read()).toEqual({
      asin: object.asin, market: object.market, evidence, turns: thread,
    })
    const shadow = await overlaySide(area)
    const sidebar = sidebarRendered()
    const inOverlay = shape(shadow as unknown as ShadowRoot)
    expect(inOverlay.length).toBeGreaterThan(4)
    expect(inOverlay).toEqual(shape(sidebar))
    expect(data[CONVERSATION_STORAGE_KEY]).toBeDefined()
  })

  it('两处的抽屉分区由同一份证据包算出，因此是同一套分区', async () => {
    const { area } = memoryStorage()
    await publish(area)
    const shadow = await overlaySide(area)
    shadow.querySelector<HTMLButtonElement>('.panel-drawer-toggle')!.click()
    const inOverlay = [...shadow.querySelectorAll<HTMLElement>('.panel-drawer-views [data-view]')].map((node) => node.dataset.view)
    // 关键词表这类宽表在气泡里退成入口，但分区本身必须在抽屉里。
    expect(inOverlay).toEqual(['object-summary', 'keyword-summary', 'keyword-table'])
    expect(shadow.textContent).toContain('yoga mat')
    expect(shadow.textContent).toContain('第 1 页 · 12')
  })

  it('浮层读的是发布出去的那条对话，不是自己另问一次', async () => {
    // 一条都还没发布过：浮层一条气泡也不编，因为它自己不会去问。
    const { area } = memoryStorage()
    const shadow = await overlaySide(area)
    expect(shadow.querySelectorAll('[data-bubble]')).toHaveLength(0)
    expect(shadow.textContent).toContain('B07Z82895W')
  })
})

describe('浮层与面板读同一个对象', () => {
  it('对象换掉之后浮层不再显示上一个对象的对话', async () => {
    const { area } = memoryStorage()
    // 存储里留着的是另一个对象的对话：当前对象不是它，浮层一条气泡都不显示。
    await new ConversationStore(area).write({
      asin: 'B0ZYXWVUTS', market: 'US', evidence: { ...evidence, asin: 'B0ZYXWVUTS' }, turns: thread as never,
    })
    const shadow = await overlaySide(area)
    expect(shadow.querySelectorAll('[data-bubble]')).toHaveLength(0)
  })
})
