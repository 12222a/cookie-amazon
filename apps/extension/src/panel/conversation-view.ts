import type { AnalysisAskSuccess, AnalysisViewType } from '@cookie-amazon/protocol'
import type { AnalysisEvidence } from '@cookie-amazon/protocol'
import { markAnswerSentences } from './citation-marker'
import { renderBubbleViews } from './analysis-view'

/**
 * 对话串的渲染，两套外壳共用一份（ADR-0004 要求两处视觉与交互一致，#22）。
 *
 * 侧边栏是普通文档，浮层在 shadow DOM 里、没有框架；两边唯一的区别是**容器**，
 * 所以这里只跟 Document 与容器打交道，不碰任何一侧的固定 id，也不读自己的状态。
 * 复制一份渲染代码给浮层，就是「两处显示不同的东西」的起点——那正是这张票要消掉的事。
 */

export type ConversationTurn = {
  question: string
  /** 一轮失败时留着 null：提问还在对话串里，重试接的就是它。 */
  answer: { response: AnalysisAskSuccess; evidence: AnalysisEvidence } | null
}

const element = <K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const section = (document: Document, label: string, content: HTMLElement, kind: string): HTMLElement => {
  const node = element(document, 'section', 'panel-bubble-section')
  node.dataset.section = kind
  const title = element(document, 'h3')
  title.textContent = label
  node.append(title, content)
  return node
}

/** 一条带句中标号的回答：标号是 sup，序号指向底部来源清单。 */
const markedList = (
  document: Document,
  className: string,
  values: readonly string[],
  citations: AnalysisAskSuccess['answer']['citations'],
): HTMLElement => {
  const list = element(document, 'ul', className)
  for (const sentence of markAnswerSentences(values, citations)) {
    const item = element(document, 'li')
    const text = element(document, 'span')
    text.textContent = sentence.text
    item.append(text)
    for (const mark of sentence.marks) {
      const sup = element(document, 'sup', 'panel-citation-marker')
      sup.textContent = mark
      sup.dataset.marker = mark
      item.append(sup)
    }
    list.append(item)
  }
  return list
}

/** 来源清单里那句话说的是「这个值来自哪里」，所以标签要落回用户看得懂的来源名。 */
const ANALYSIS_SOURCE_LABELS: Record<string, string> = {
  storefront: '亚马逊前台',
  sellersprite: 'SellerSprite',
  derived: '计算结果',
  'research-record': '小组研究记录',
}

/**
 * 底部来源清单：序号 + 标签 + 值 + 来自哪里，序号就是句中标号里的那个数。
 *
 * 「来自哪里」不能省：这是用户判断某个数能不能信的依据，也是引用标号要指到的东西。
 */
const sourceList = (document: Document, citations: AnalysisAskSuccess['answer']['citations']): HTMLElement => {
  const list = element(document, 'ol', 'panel-source-list')
  list.dataset.section = 'sources'
  for (const [index, citation] of citations.entries()) {
    const item = element(document, 'li')
    const number = element(document, 'b')
    number.textContent = String(index + 1)
    const label = element(document, 'span')
    label.textContent = citation.label
    const value = element(document, 'i')
    value.textContent = citation.value + '（' + (ANALYSIS_SOURCE_LABELS[citation.source] ?? citation.source) + '）'
    item.append(number, label, value)
    list.append(item)
  }
  return list
}

const renderAnswerBubble = (
  document: Document,
  turn: { response: AnalysisAskSuccess; evidence: AnalysisEvidence },
  onOpenDrawer: (type: AnalysisViewType) => void,
): HTMLElement => {
  const bubble = element(document, 'article', 'panel-bubble panel-bubble-answer')
  bubble.dataset.bubble = 'answer'
  const { answer } = turn.response
  bubble.append(
    section(document, '事实', markedList(document, 'panel-analysis-list', answer.facts, answer.citations), 'facts'),
    section(document, '结论与判断', markedList(document, 'panel-analysis-list', answer.inferences, answer.citations), 'inferences'),
    sourceList(document, answer.citations),
  )
  const views = element(document, 'div', 'panel-bubble-views')
  views.dataset.section = 'views'
  // 内嵌视图只认当轮的证据包：之后数据变了，也不该改写已经说出口的那句话。
  renderBubbleViews(document, views, turn.response.view, turn.evidence, onOpenDrawer)
  if (views.children.length > 0) bubble.append(views)
  return bubble
}

/**
 * 整串重建。
 *
 * 一轮一轮往上叠是 bug 的温床——切对象、失败重试、重渲染都会留下上一轮的气泡。
 * 对话条数少，整串重建换的是「屏幕上永远等于传进来的那些」。
 *
 * 打开数据抽屉是各壳自己的事（两边的抽屉不是同一个东西），所以只把视图类型交回去。
 */
export const renderConversationThread = (
  document: Document,
  container: HTMLElement,
  turns: readonly ConversationTurn[],
  onOpenDrawer: (type: AnalysisViewType) => void,
): void => {
  const question = (text: string): HTMLElement => {
    const bubble = element(document, 'div', 'panel-bubble panel-bubble-question')
    bubble.dataset.bubble = 'question'
    const body = element(document, 'p')
    body.textContent = text
    bubble.append(body)
    return bubble
  }
  container.replaceChildren(...turns.flatMap<HTMLElement>((turn) => [
    question(turn.question),
    ...(turn.answer === null ? [] : [renderAnswerBubble(document, turn.answer, onOpenDrawer)]),
  ]))
}
