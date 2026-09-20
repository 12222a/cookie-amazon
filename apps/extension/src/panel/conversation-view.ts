import type { AnalysisAskSuccess, AnalysisViewType } from '@cookie-amazon/protocol'
import type { AnalysisEvidence, AnalysisHistoryTurn } from '@cookie-amazon/protocol'
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

/**
 * 追问的上下文：对话串里已经答出来的轮次，只取问答文本。
 *
 * 证据包副本、引用对象与视图规格都不进历史，每轮请求仍只发当前证据包，
 * 请求体因此不随轮数线性膨胀（ADR-0005 的追加决定）。两壳共用这里一处，
 * 「同一句追问在两边拿到同样的上下文」才有保证。条数上限由 analysis-client 统一裁：
 * 出站请求体的形状是那一层的事。
 */
export const conversationHistory = (turns: readonly ConversationTurn[]): AnalysisHistoryTurn[] =>
  turns.flatMap((turn) => turn.answer === null ? [] : [{
    question: turn.question,
    facts: turn.answer.response.answer.facts,
    inferences: turn.answer.response.answer.inferences,
  }])

/**
 * 一轮问答怎么接进对话串：两条规则只写这一处。
 *
 * 两套外壳都在这条对话串上加轮次（侧边栏与浮层都能提问），各写一份迟早分叉，
 * 而分叉的样子就是「一边能看到两个一样的问题气泡、另一边只看到一个」。
 */

/** 哪一轮是「刚问的那句、还没回答」：回答要补回这一轮上，而不是在末尾另添一条。 */
const pendingIndex = (turns: readonly ConversationTurn[], question: string): number => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]!
    if (turn.answer === null && turn.question === question) return index
  }
  return -1
}

/**
 * 接上一条提问。
 *
 * 用户又提交了还没有回答的那一句时接的是同一轮：同一条问句在对话串里留两个气泡，
 * 用户会以为问了两遍。
 */
export const withQuestion = (turns: readonly ConversationTurn[], question: string): ConversationTurn[] =>
  pendingIndex(turns, question) === -1 ? [...turns, { question, answer: null }] : [...turns]

/**
 * 把回答补回它那一轮。
 *
 * 那一轮已经不在了（比如请求在路上时对话串被换过）就接在末尾——宁可多一条，
 * 也不要让回答悄悄丢掉。返回新数组，调用方不原地改。
 */
export const withAnswer = (
  turns: readonly ConversationTurn[],
  question: string,
  answer: ConversationTurn['answer'],
): ConversationTurn[] => {
  const index = pendingIndex(turns, question)
  return index === -1
    ? [...turns, { question, answer }]
    : turns.map((turn, position) => position === index ? { ...turn, answer } : turn)
}

/**
 * 把另一处写下的那一条对话并进本地这一份。
 *
 * 两处都能提问，谁也不是对方的镜像：存储里那份是共有的，本地这份可能比它多（刚问出去、
 * 写入还在路上），也可能比它少（另一处刚问了一轮）。谁按自己的那份整份覆盖，对方那一轮
 * 就没了——所以按问句求并集。
 *
 * 顺序以共有的那份为准，本地多出来的接在后面：跨壳的先后没有可比的时间戳，
 * 而「刚问出去的那句挨着自己」是用户看得见的那件事。
 */
export const mergeTurns = (
  shared: readonly ConversationTurn[],
  local: readonly ConversationTurn[],
): ConversationTurn[] => {
  const mine = new Map(local.map((turn) => [turn.question, turn]))
  const merged = shared.map((turn) => {
    const own = mine.get(turn.question)
    mine.delete(turn.question)
    // 同一条问句，一边答出来了、一边还挂着：留答出来的那份。
    return own !== undefined && own.answer !== null && turn.answer === null ? own : turn
  })
  // 剩下的都是共有的那份还没有的轮次，按本地先后接在后面。
  return [...merged, ...mine.values()]
}

/**
 * 两份对话串是不是同一条。
 *
 * 用来判断「这次变更有没有带来新东西」——没有就别重渲染：那多半正是自己刚写出去的那一份，
 * 绕回去照着重画就是自激。
 */
export const sameTurns = (
  left: readonly ConversationTurn[],
  right: readonly ConversationTurn[],
): boolean =>
  left.length === right.length && left.every((turn, index) => {
    const other = right[index]!
    return turn.question === other.question && (turn.answer === null) === (other.answer === null)
  })

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
