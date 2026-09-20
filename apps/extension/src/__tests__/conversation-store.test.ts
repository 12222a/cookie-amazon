import { describe, expect, it } from 'vitest'
import { ConversationStore, CONVERSATION_STORAGE_KEY, type PublishedConversation } from '../panel/conversation-store'
import { buildAnalysisEvidence } from '../panel/analysis-evidence'
import { createAnalysisObject } from '../analysis-object'
import type { StorageArea } from '../remote-config'

const memoryStorage = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial }
  const area: StorageArea = {
    async get(key) { return { [key]: data[key] } },
    async set(items) { Object.assign(data, items) },
  }
  return { area, data }
}

const object = createAnalysisObject({
  asin: 'B07Z82895W', market: 'US', source: 'manual', now: 1_700_000_000_000,
})!

const evidence = buildAnalysisEvidence({ object })

/** 侧边栏发布的那一份：同一个对象、同一条对话串、同一份证据包。 */
const published = (asin = 'B07Z82895W'): PublishedConversation => ({
  asin,
  market: 'US',
  evidence,
  turns: [{
    question: '这个词位结构更依赖自然位还是广告位？',
    answer: {
      response: {
        ok: true,
        answer: {
          facts: ['前台价格是 19.99 美元。'],
          inferences: ['先看低星问题。'],
          citations: [{ id: 'object.price', label: '前台价格', value: '19.99', source: 'storefront' }],
        },
        view: { schemaVersion: 1, views: ['object-summary'] },
      },
      evidence,
    },
  }],
})

describe('ConversationStore', () => {
  it('misses when nothing has been published yet', async () => {
    const { area } = memoryStorage()
    expect(await new ConversationStore(area).read()).toBeNull()
  })

  it('round-trips the conversation the sidebar answered', async () => {
    const { area } = memoryStorage()
    const store = new ConversationStore(area)
    await store.write(published())
    const read = await store.read()
    expect(read?.asin).toBe('B07Z82895W')
    expect(read?.turns).toHaveLength(1)
    expect(read?.turns[0]!.question).toBe('这个词位结构更依赖自然位还是广告位？')
    expect(read?.turns[0]!.answer?.response.answer.facts).toEqual(['前台价格是 19.99 美元。'])
  })

  it('carries the same evidence bundle the answer was rendered from', async () => {
    const { area } = memoryStorage()
    const store = new ConversationStore(area)
    await store.write(published())
    const read = await store.read()
    // 两壳共用一份证据包：抽屉里的数字与对话里引用的数字因此不可能不同。
    expect(read?.evidence?.asin).toBe('B07Z82895W')
    expect(read?.turns[0]!.answer?.evidence.asin).toBe('B07Z82895W')
  })

  it('ignores a record written by another version of the extension', async () => {
    const { area } = memoryStorage({ [CONVERSATION_STORAGE_KEY]: { asin: 'B07Z82895W', turns: 'not-an-array' } })
    expect(await new ConversationStore(area).read()).toBeNull()
  })

  it('drops a turn whose answer is not shaped like an answer', async () => {
    const { area } = memoryStorage()
    const store = new ConversationStore(area)
    const broken = published()
    await store.write({ ...broken, turns: [...broken.turns, { question: '坏的一轮', answer: { response: { ok: true }, evidence } } as never] })
    const read = await store.read()
    // 一轮坏数据不该带走整条对话；读不出来的是那一轮，不是全部。
    expect(read?.turns).toHaveLength(1)
    expect(read?.turns[0]!.question).toBe('这个词位结构更依赖自然位还是广告位？')
  })

  it('reports a failed write instead of throwing at the panel', async () => {
    const area: StorageArea = {
      async get() { return {} },
      async set() { throw new Error('quota exceeded') },
    }
    await expect(new ConversationStore(area).write(published())).resolves.toBe(false)
  })

  it('reads as missing when the stored record cannot be read', async () => {
    const area: StorageArea = {
      async get() { throw new Error('unavailable') },
      async set() {},
    }
    expect(await new ConversationStore(area).read()).toBeNull()
  })
})
