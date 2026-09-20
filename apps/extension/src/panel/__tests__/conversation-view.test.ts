import { describe, expect, it, vi } from 'vitest'
import {
  conversationHistory,
  renderConversationThread,
  withAnswer,
  withQuestion,
  type ConversationTurn,
} from '../conversation-view'
import { buildAnalysisEvidence } from '../analysis-evidence'
import { createAnalysisObject } from '../../analysis-object'

/**
 * 气泡与来源清单的渲染是两壳共用的一份（#22）。
 *
 * 用真实文档渲染，读的是语义——气泡身份、分区标题、标号、来源序号——不比对 HTML 长相。
 */
const document = globalThis.document

const evidence = buildAnalysisEvidence({
  object: createAnalysisObject({ asin: 'B07Z82895W', market: 'US', source: 'manual', now: 1_700_000_000_000 })!,
})

const answered = (question = '这个 ASIN 现在最需要关注什么？'): ConversationTurn => ({
  question,
  answer: {
    response: {
      ok: true,
      answer: {
        facts: ['前台价格是 19.99 美元。', '反查到的 50 个关键词里 41 个有自然排名。'],
        inferences: ['先看低星问题。'],
        citations: [
          { id: 'object.price', label: '前台价格', value: '19.99', source: 'storefront' },
          { id: 'keyword.summary.ranked', label: '关键词总数', value: '41', source: 'derived' },
        ],
      },
      view: { schemaVersion: 1, views: ['object-summary'] },
    },
    evidence,
  },
})

const render = (turns: readonly ConversationTurn[], onOpenDrawer = vi.fn()) => {
  const container = document.createElement('div')
  renderConversationThread(document, container, turns, onOpenDrawer)
  return { container, onOpenDrawer }
}

const bubbles = (container: HTMLElement, kind: string): HTMLElement[] =>
  [...container.querySelectorAll<HTMLElement>('[data-bubble]')].filter((node) => node.dataset.bubble === kind)

const section = (bubble: HTMLElement, kind: string): HTMLElement | null =>
  bubble.querySelector<HTMLElement>('[data-section=' + kind + ']')

const items = (parent: HTMLElement | null): HTMLElement[] =>
  parent === null ? [] : [...parent.querySelectorAll<HTMLElement>('li')]

/** 一句话末尾的标号：sup 里的数字就是底部来源清单里的序号。 */
const marksOf = (item: HTMLElement): string[] =>
  [...item.querySelectorAll<HTMLElement>('sup')].map((sup) => sup.textContent ?? '')

describe('renderConversationThread', () => {
  it('renders a question bubble and an answer bubble for one answered turn', () => {
    const { container } = render([answered()])
    const questions = bubbles(container, 'question')
    const answers = bubbles(container, 'answer')
    expect(questions).toHaveLength(1)
    expect(answers).toHaveLength(1)
    expect(questions[0]!.textContent).toContain('这个 ASIN 现在最需要关注什么？')
  })

  it('splits facts from inferences and lists both under their own heading', () => {
    const { container } = render([answered()])
    const bubble = bubbles(container, 'answer')[0]!
    const facts = section(bubble, 'facts')!
    const inferences = section(bubble, 'inferences')!
    expect(facts.querySelector('h3')?.textContent).toBe('事实')
    expect(inferences.querySelector('h3')?.textContent).toBe('结论与判断')
    expect(items(facts)).toHaveLength(2)
    expect(items(inferences)).toHaveLength(1)
  })

  it('numbers the sentences from the source list, so the superscripts point at real sources', () => {
    const { container } = render([answered()])
    const bubble = bubbles(container, 'answer')[0]!
    // 编号是渲染产物：事实里的「19.99」认领第 1 条来源，「41」认领第 2 条。
    const facts = items(section(bubble, 'facts'))
    expect(marksOf(facts[0]!)).toEqual(['1'])
    expect(marksOf(facts[1]!)).toEqual(['2'])
    const sources = [...section(bubble, 'sources')!.querySelectorAll('li')]
    expect(sources.map((line) => line.querySelector('b')?.textContent)).toEqual(['1', '2'])
    expect(sources[0]!.textContent).toContain('亚马逊前台')
  })

  it('renders the view entries inside the bubble and hands the click to the caller', () => {
    const { container, onOpenDrawer } = render([answered()])
    const bubble = bubbles(container, 'answer')[0]!
    const views = section(bubble, 'views')!
    expect(views.querySelector('[data-view=object-summary]')).not.toBeNull()
    expect(bubbles(container, 'answer')).toHaveLength(1)
    // 两壳各有自己的抽屉，所以打开抽屉这件事由调用方决定，渲染层只把类型交出去。
    expect(onOpenDrawer).not.toHaveBeenCalled()
  })

  it('keeps a question whose answer never arrived, without inventing an answer bubble', () => {
    const { container } = render([{ question: '失败的一问？', answer: null }])
    expect(bubbles(container, 'question')).toHaveLength(1)
    expect(bubbles(container, 'answer')).toHaveLength(0)
    expect(container.textContent).toContain('失败的一问？')
  })

  it('rebuilds the whole thread, so a turn that left cannot linger on screen', () => {
    const container = document.createElement('div')
    renderConversationThread(document, container, [answered('第一问？'), answered('第二问？')], vi.fn())
    renderConversationThread(document, container, [], vi.fn())
    expect(bubbles(container, 'question')).toHaveLength(0)
    expect(container.textContent).not.toContain('第一问？')
  })
})

/**
 * 往对话串上加轮次的两条规则（#24）。两壳都走这里：分叉的样子就是「一边两个问题气泡」。
 */
describe('withQuestion', () => {
  it('接上新的一句', () => {
    const next = withQuestion([answered('第一问？')], '第二问？')
    expect(next.map((turn) => turn.question)).toEqual(['第一问？', '第二问？'])
    expect(next[1]!.answer).toBeNull()
  })

  it('重问还没答出来的那一句时接的是同一轮，不再添一个一样的气泡', () => {
    const pending: ConversationTurn = { question: '失败的一问？', answer: null }
    const next = withQuestion([pending], '失败的一问？')
    expect(next).toHaveLength(1)
  })

  it('已经答过的那一句再问一次是一次新的提问', () => {
    const next = withQuestion([answered('问过的？')], '问过的？')
    expect(next).toHaveLength(2)
    expect(next[1]!.answer).toBeNull()
  })

  it('不改传进来的那份', () => {
    const turns = [answered('第一问？')]
    withQuestion(turns, '第二问？')
    expect(turns).toHaveLength(1)
  })
})

describe('withAnswer', () => {
  const answer = answered().answer

  it('把回答补回它那一轮上，不新添一条', () => {
    const turns: ConversationTurn[] = [{ question: '第一问？', answer: null }, { question: '第二问？', answer: null }]
    const next = withAnswer(turns, '第一问？', answer)
    expect(next).toHaveLength(2)
    expect(next[0]!.answer).toEqual(answer)
    expect(next[1]!.answer).toBeNull()
  })

  it('那一轮已经不在了就接在末尾：宁可多一条，也不让回答丢掉', () => {
    const next = withAnswer([answered('别的问？')], '已经不在的那句？', answer)
    expect(next.map((turn) => turn.question)).toEqual(['别的问？', '已经不在的那句？'])
    expect(next[1]!.answer).toEqual(answer)
  })
})

describe('conversationHistory', () => {
  it('只取已经答出来的轮次，且只带问答文本', () => {
    const turns: ConversationTurn[] = [
      answered('答过的？'),
      // 还没有回答的那一轮不进上下文：里面不能有模型没说过的话。
      { question: '还在问的？', answer: null },
    ]
    expect(conversationHistory(turns)).toEqual([{
      question: '答过的？',
      facts: ['前台价格是 19.99 美元。', '反查到的 50 个关键词里 41 个有自然排名。'],
      inferences: ['先看低星问题。'],
    }])
  })
})
