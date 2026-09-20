import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountOverlay, OVERLAY_HOST_ID, type OverlayHandlers, type OverlayHandle } from '../overlay'
import { createAnalysisObject, type AnalysisObject } from '../../analysis-object'
import { buildAnalysisEvidence } from '../analysis-evidence'
import type { ConversationTurn, PublishedConversation } from '../conversation-store'
import type { AnalysisResult } from '../analysis-client'

/**
 * 浮层里的就地提问（#24）。
 *
 * 断言的是外部行为：问过之后发布出去的那条对话串长了什么、浮层上出现了什么、
 * 越界与失败各自说了什么、写入被拒时降级成什么样。不比对 HTML 长相，
 * 也不比对内部函数调用顺序。
 */
const document = globalThis.document

const object: AnalysisObject = createAnalysisObject({
  asin: 'B07Z82895W', market: 'US', source: 'storefront', now: 1_700_000_000_000,
  storefront: { title: '折叠硅胶瑜伽垫', price: 29.99, rating: 4.3, reviews: 1204, sponsored: false },
})!

const evidence = buildAnalysisEvidence({ object })

const ANSWER: Extract<AnalysisResult, { kind: 'answer' }> = {
  kind: 'answer',
  response: {
    ok: true,
    answer: {
      facts: ['前台价格是 29.99 美元。'],
      inferences: ['先看低星问题。'],
      citations: [{ id: 'object.price', label: '前台价格', value: '29.99', source: 'storefront' }],
    },
    view: { schemaVersion: 1, views: ['object-summary'] },
  },
}

const answered = (question: string): ConversationTurn => ({
  question,
  answer: { response: ANSWER.response, evidence },
})

/**
 * 两壳共用的那份存储：侧边栏写的、浮层读的，也是浮层写回的地方。
 * 浮层侧走的是真接口，中间只有一个内存区——交接处不是替身。
 */
const sharedConversation = (initial: ConversationTurn[] = []) => {
  const writes: PublishedConversation[] = []
  let current: PublishedConversation | null = {
    asin: object.asin, market: object.market, evidence, turns: initial,
  }
  let failing = false
  return {
    writes,
    read: () => current,
    setFailing: (value: boolean) => { failing = value },
    /** 侧边栏那一侧写入（比如用户回到面板上又问了一句）。 */
    fromSidebar: (next: PublishedConversation | null) => { current = next },
    publish: async (next: PublishedConversation): Promise<boolean> => {
      if (failing) return false
      writes.push(next)
      current = next
      return true
    },
  }
}

let handle: OverlayHandle | null = null

afterEach(() => { handle?.remove(); handle = null })

const mount = (
  handlers: Pick<OverlayHandlers, 'readConversation'> & Partial<Pick<OverlayHandlers, 'askAnalysis' | 'publishConversation'>>,
): ShadowRoot => {
  handle = mountOverlay(document, {
    onPin: async () => true,
    onToggleCollapsed: () => {},
    onMove: () => {},
    ...handlers,
  }, { x: 0, y: 0 })
  expect(handle).not.toBeNull()
  return document.getElementById(OVERLAY_HOST_ID)!.shadowRoot!
}

const settle = async (): Promise<void> => { for (let i = 0; i < 40; i++) await Promise.resolve() }

/**
 * 提问的替身。
 *
 * 类型跟着真实接缝走：断言出站参数（用的是哪份证据包、带了哪几轮上下文）时，
 * 形参类型由 OverlayHandlers 给出，不靠推断猜。
 */
const askSpy = (result: AnalysisResult | Promise<AnalysisResult>) =>
  vi.fn<NonNullable<OverlayHandlers['askAnalysis']>>(async () => result)

const askForm = (shadow: ShadowRoot): HTMLFormElement => shadow.querySelector<HTMLFormElement>('.ca-ask')!
const askInput = (shadow: ShadowRoot): HTMLInputElement => shadow.querySelector<HTMLInputElement>('.ca-ask-input')!
const askButton = (shadow: ShadowRoot): HTMLButtonElement => shadow.querySelector<HTMLButtonElement>('.ca-ask button')!
const statusText = (shadow: ShadowRoot): string => shadow.querySelector('.ca-ask-status')?.textContent ?? ''
const questions = (shadow: ShadowRoot): string[] =>
  [...shadow.querySelectorAll<HTMLElement>('[data-bubble=question]')].map((node) => node.textContent ?? '')

/** 在浮层里打字并提交：与用户走的同一条路（表单提交，不是直接调函数）。 */
const ask = async (shadow: ShadowRoot, question: string): Promise<void> => {
  askInput(shadow).value = question
  askForm(shadow).dispatchEvent(new Event('submit'))
  await settle()
}

describe('浮层里的就地提问', () => {
  it('问出来的那一轮进的是同一条对话串，不另起一条', async () => {
    const shared = sharedConversation()
    const shadow = mount({ readConversation: shared.read, askAnalysis: async () => ANSWER, publishConversation: shared.publish })
    handle!.render(object, 'card')

    await ask(shadow, '这个词位结构更依赖自然位还是广告位？')

    // 两次写入：先落问题（侧边栏立刻能看到有人正在问），再补上同一轮的回答。
    expect(shared.writes).toHaveLength(2)
    expect(shared.writes[0]!.turns.map((turn) => turn.question)).toEqual(['这个词位结构更依赖自然位还是广告位？'])
    expect(shared.writes[0]!.turns[0]!.answer).toBeNull()
    expect(shared.writes[1]!.turns).toHaveLength(1)
    expect(shared.writes[1]!.turns[0]!.answer?.response.answer.facts).toEqual(['前台价格是 29.99 美元。'])
    // 对象与证据包跟着这一轮一起发布：两壳读的是同一条对话、同一份数据。
    expect(shared.writes[1]!.asin).toBe(object.asin)
    expect(shared.writes[1]!.evidence).toEqual(evidence)
  })

  it('回答回到同一轮上，浮层里是一个问句气泡加一个回答气泡', async () => {
    const shared = sharedConversation()
    const shadow = mount({ readConversation: shared.read, askAnalysis: async () => ANSWER, publishConversation: shared.publish })
    handle!.render(object, 'card')

    await ask(shadow, '这个词位结构更依赖自然位还是广告位？')

    expect(questions(shadow)).toEqual(['这个词位结构更依赖自然位还是广告位？'])
    expect(shadow.querySelectorAll('[data-bubble=answer]')).toHaveLength(1)
    // 回答与侧边栏那一条同源：同一个渲染器，事实与来源清单都在。
    expect(shadow.textContent).toContain('前台价格是 29.99 美元。')
    expect(statusText(shadow)).toContain('已生成回答')
  })

  it('已经答出来的那一轮不会被后来的问题挤掉', async () => {
    const shared = sharedConversation([answered('上一个问题？')])
    const shadow = mount({ readConversation: shared.read, askAnalysis: async () => ANSWER, publishConversation: shared.publish })
    handle!.render(object, 'card')

    await ask(shadow, '那长尾词呢？')

    expect(questions(shadow)).toEqual(['上一个问题？', '那长尾词呢？'])
    expect(shared.writes[1]!.turns).toHaveLength(2)
  })

  it('问的是快照里那一份证据包，不自己另取一份', async () => {
    const snapshotEvidence = { ...evidence, object: { ...evidence.object, title: '侧边栏读到的那份标题' } }
    const shared = sharedConversation()
    shared.fromSidebar({ ...shared.read()!, evidence: snapshotEvidence })
    const askAnalysis = askSpy(ANSWER)
    const shadow = mount({ readConversation: shared.read, askAnalysis, publishConversation: shared.publish })
    handle!.render(object, 'card')

    await ask(shadow, '标题是什么？')

    expect(askAnalysis.mock.calls[0]![1]).toEqual(snapshotEvidence)
    expect(shared.writes[0]!.evidence).toEqual(snapshotEvidence)
  })

  it('追问带上对话串里已经答出来的那几轮', async () => {
    const shared = sharedConversation([answered('上一个问题？')])
    const askAnalysis = askSpy(ANSWER)
    const shadow = mount({ readConversation: shared.read, askAnalysis, publishConversation: shared.publish })
    handle!.render(object, 'card')

    await ask(shadow, '那长尾词呢？')

    // 上下文只带问答文本；侧边栏问过的那一轮也在里面，追问才接得住指代。
    expect(askAnalysis.mock.calls[0]![2]).toEqual([{
      question: '上一个问题？',
      facts: ['前台价格是 29.99 美元。'],
      inferences: ['先看低星问题。'],
    }])
  })

  it('越界的问题沿用既有 UNSUPPORTED_SCOPE 语义与文案，且不装作答过', async () => {
    const shared = sharedConversation()
    const message = '当前只能分析前台、词位、评论和研究记录，无法回答成本、利润或合规问题。'
    const shadow = mount({
      readConversation: shared.read,
      askAnalysis: async () => ({ kind: 'unsupported-scope', message }),
      publishConversation: shared.publish,
    })
    handle!.render(object, 'card')

    await ask(shadow, '这个品的利润是多少？')

    expect(statusText(shadow)).toBe(message)
    // 问题留在对话串里（用户可以看着它重问），但没有回答气泡。
    expect(questions(shadow)).toEqual(['这个品的利润是多少？'])
    expect(shadow.querySelectorAll('[data-bubble=answer]')).toHaveLength(0)
    expect(shared.writes).toHaveLength(1)
  })

  it('拿不到回答时浮层按既有约定降级：表头、抽屉与页面都还在', async () => {
    const shared = sharedConversation()
    const shadow = mount({
      readConversation: shared.read,
      askAnalysis: async () => ({ kind: 'failed', reason: 'AI 分析服务暂时不可用' }),
      publishConversation: shared.publish,
    })
    handle!.render(object, 'card')

    await expect(ask(shadow, '这个 ASIN 的前台信息是什么？')).resolves.toBeUndefined()

    // 表头与抽屉都原样在：提问失败不该动到浮层的其他地方，更不该动到页面。
    expect(shadow.textContent).toContain('B07Z82895W')
    expect(shadow.querySelector('.panel-drawer-toggle')).not.toBeNull()
    expect(statusText(shadow)).toContain('AI 分析服务暂时不可用')
    expect(shadow.querySelectorAll('[data-bubble=answer]')).toHaveLength(0)
    // 失败的那一轮仍在对话串里等着重问，不是被抹掉。
    expect(questions(shadow)).toEqual(['这个 ASIN 的前台信息是什么？'])
  })

  it('中转本身抛出时同样只是「没拿到回答」，不把异常丢给亚马逊页面', async () => {
    const shared = sharedConversation()
    const shadow = mount({
      readConversation: shared.read,
      askAnalysis: async () => { throw new Error('relay unavailable') },
      publishConversation: shared.publish,
    })
    handle!.render(object, 'card')

    await expect(ask(shadow, '这个 ASIN 的前台信息是什么？')).resolves.toBeUndefined()

    expect(statusText(shadow)).toContain('没能拿到回答')
    expect(shadow.textContent).toContain('B07Z82895W')
    expect(shadow.querySelector('.panel-drawer-toggle')).not.toBeNull()
  })

  it('写不进共有的那条对话时干脆不问：问了也只有本页一条，那正是要消掉的东西', async () => {
    const shared = sharedConversation()
    shared.setFailing(true)
    const askAnalysis = askSpy(ANSWER)
    const shadow = mount({ readConversation: shared.read, askAnalysis, publishConversation: shared.publish })
    handle!.render(object, 'card')

    await ask(shadow, '这个词位结构更依赖自然位还是广告位？')

    expect(askAnalysis).not.toHaveBeenCalled()
    expect(shared.writes).toHaveLength(0)
    // 明确的降级表现：说清楚为什么没问，且用户打的字还在。
    expect(statusText(shadow)).toContain('没能记下这一轮')
    expect(askInput(shadow).value).toBe('这个词位结构更依赖自然位还是广告位？')
  })

  it('回答写不回去时说明它没进共有的那条对话，那一轮留在待回答上', async () => {
    const shared = sharedConversation()
    // 第一次写（问题）成功，第二次写（回答）被拒：侧边栏看得到问句，看不到回答。
    const shadow = mount({
      readConversation: shared.read,
      askAnalysis: async () => ANSWER,
      publishConversation: async (next) => {
        if (shared.writes.length > 0) return false
        return shared.publish(next)
      },
    })
    handle!.render(object, 'card')

    await ask(shadow, '这个词位结构更依赖自然位还是广告位？')

    expect(statusText(shadow)).toContain('没能写进共有的那条对话')
    // 屏幕上的对话仍是发布出去的那一条：没有只在本地存在的一轮。
    expect(questions(shadow)).toEqual(['这个词位结构更依赖自然位还是广告位？'])
    expect(shadow.querySelectorAll('[data-bubble=answer]')).toHaveLength(0)
  })

  it('快照还不是当前对象的对话时，用当前对象自己的那份证据包提问', async () => {
    const shared = sharedConversation()
    shared.fromSidebar({
      asin: 'B0ZYXWVUTS', market: 'US', evidence: { ...evidence, asin: 'B0ZYXWVUTS' }, turns: [answered('别的对象的问题？')],
    })
    const askAnalysis = askSpy(ANSWER)
    const shadow = mount({ readConversation: shared.read, askAnalysis, publishConversation: shared.publish })
    handle!.render(object, 'card')

    await ask(shadow, '这个问题是关于当前对象的吗？')

    // 上一个对象的证据包不参与提问，也不会被写进当前对象的对话里。
    expect(askAnalysis.mock.calls[0]![1]).toEqual(evidence)
    expect(askAnalysis.mock.calls[0]![2]).toEqual([])
    expect(shared.writes[0]!.asin).toBe(object.asin)
    expect(shared.writes[0]!.turns.map((turn) => turn.question)).toEqual(['这个问题是关于当前对象的吗？'])
  })

  it('提问进行中禁用提交，同一句点两次也只问一次', async () => {
    const shared = sharedConversation()
    let release = (): void => {}
    const pending = new Promise<AnalysisResult>((resolve) => { release = () => resolve(ANSWER) })
    const askAnalysis = vi.fn<NonNullable<OverlayHandlers['askAnalysis']>>(async () => pending)
    const shadow = mount({ readConversation: shared.read, askAnalysis, publishConversation: shared.publish })
    handle!.render(object, 'card')

    askInput(shadow).value = '这个问题只该问一次？'
    askForm(shadow).dispatchEvent(new Event('submit'))
    await settle()
    expect(askButton(shadow).disabled).toBe(true)
    askForm(shadow).dispatchEvent(new Event('submit'))
    await settle()
    expect(askAnalysis).toHaveBeenCalledTimes(1)
    release()
    await settle()
    expect(askButton(shadow).disabled).toBe(false)
  })

  it('空问题不打扰端点，只提示先写下来', async () => {
    const shared = sharedConversation()
    const askAnalysis = askSpy(ANSWER)
    const shadow = mount({ readConversation: shared.read, askAnalysis, publishConversation: shared.publish })
    handle!.render(object, 'card')

    await ask(shadow, '   ')

    expect(askAnalysis).not.toHaveBeenCalled()
    expect(shared.writes).toHaveLength(0)
    expect(statusText(shadow)).toContain('先写下')
  })

  it('收起成药丸时不留提问入口，展开回来还在', async () => {
    const shared = sharedConversation()
    const shadow = mount({ readConversation: shared.read, askAnalysis: async () => ANSWER, publishConversation: shared.publish })
    handle!.render(object, 'card')
    expect(askForm(shadow).hidden).toBe(false)

    handle!.render(object, 'pill')
    expect(askForm(shadow).hidden).toBe(true)

    handle!.render(object, 'card')
    expect(askForm(shadow).hidden).toBe(false)
  })

  it('一条对话都还没有时也能问第一句', async () => {
    const shared = sharedConversation()
    shared.fromSidebar(null)
    const shadow = mount({ readConversation: shared.read, askAnalysis: async () => ANSWER, publishConversation: shared.publish })
    handle!.render(object, 'card')

    await ask(shadow, '这个 ASIN 的前台信息是什么？')

    expect(shared.writes[1]!.turns).toHaveLength(1)
    expect(shared.writes[1]!.asin).toBe(object.asin)
  })

  it('不传提问通道时浮层照常只读，不显示一个按不动的输入框', () => {
    const shadow = mount({ readConversation: () => null })
    handle!.render(object, 'card')
    expect(askForm(shadow).hidden).toBe(true)
    expect(shadow.textContent).toContain('B07Z82895W')
    expect(shadow.querySelector('.panel-drawer-toggle')).not.toBeNull()
  })
})
