import { isAnalysisAskResponse, type AnalysisAskSuccess, type AnalysisEvidence } from '@cookie-amazon/protocol'
import type { StorageArea } from '../remote-config'

/**
 * 对话快照的存放处，是「两套外壳显示同一条对话」的交接处（ADR-0004、#22）。
 *
 * 浮层不自己提问、也不自己取数：提问的端点只允许扩展自己的源，而浮层跑在 amazon.com 页面上，
 * 页面上就地再发起一次问答只会得到第二条与侧边栏不同的对话——正是这张票要消掉的东西。
 * 因此侧边栏（提问发生的地方）把「同一个分析对象 + 同一条对话串 + 同一份证据包」发布到这里，
 * 浮层只读这一份。一处对话，两个壳。
 *
 * 键上带版本号：存储是信任边界，扩展升级后留下的旧结构直接当作没有，
 * 而不是拿一半旧数据去渲染。
 */
export const CONVERSATION_STORAGE_KEY = 'conversation:v1'

/**
 * 一轮问答。回答里留着**当轮**的证据包：回答里的内嵌视图按提问时的数据渲染，
 * 之后又读了词位或换了研究记录，也不该改写已经说出口的那句话。
 */
export type ConversationTurn = {
  question: string
  /** 一轮失败时留着 null：提问还在对话串里，与侧边栏那条气泡一致。 */
  answer: { response: AnalysisAskSuccess; evidence: AnalysisEvidence } | null
}

export type PublishedConversation = {
  /** 快照属于哪个分析对象。与浮层当前对象不符时不予显示，绝不把上一个对象的问答留在页面上。 */
  asin: string
  market: string
  /** 抽屉那一份证据包，与对话里引用的同一份（ADR-0005），因此两处不会出现不同的数字。 */
  evidence: AnalysisEvidence | null
  turns: ConversationTurn[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const sameTarget = (left: { asin: string; market: string }, right: { asin: string; market: string }): boolean =>
  left.asin === right.asin && left.market.toUpperCase() === right.market.toUpperCase()

/** 证据包必须是这个对象的：别的对象的证据包混进来，就是屏幕上两个不同的东西。 */
const isEvidenceOf = (value: unknown, target: { asin: string; market: string }): value is AnalysisEvidence =>
  isRecord(value)
  && typeof value.asin === 'string'
  && typeof value.market === 'string'
  && sameTarget({ asin: value.asin, market: value.market }, target)

/**
 * 回答的校验交给协议自己的校验函数，不在这里重写一遍：
 * 它是回答结构唯一的事实来源，重写一份迟早会与它说得不一样。
 */
const isTurn = (value: unknown, target: { asin: string; market: string }): value is ConversationTurn => {
  if (!isRecord(value) || typeof value.question !== 'string') return false
  const { answer } = value as { answer?: unknown }
  if (answer === null) return true
  if (!isRecord(answer) || !isAnalysisAskResponse(answer.response)) return false
  return isEvidenceOf(answer.evidence, target)
}

const parse = (value: unknown): PublishedConversation | null => {
  if (!isRecord(value)) return null
  const { asin, market, turns } = value as { asin?: unknown; market?: unknown; turns?: unknown }
  if (typeof asin !== 'string' || typeof market !== 'string' || !Array.isArray(turns)) return null
  const target = { asin, market }
  const evidence = (value as { evidence?: unknown }).evidence
  return {
    asin,
    market,
    evidence: isEvidenceOf(evidence, target) ? evidence : null,
    // 一轮坏数据只带走那一轮：对话串剩下的部分照旧可读。
    turns: turns.filter((turn): turn is ConversationTurn => isTurn(turn, target)),
  }
}

/**
 * 读成功但结构不对时返回 null，而不是抛给浮层——浮层渲染不出来就什么也不显示（AC）。
 * 写失败返回 false：调用方是侧边栏的渲染路径，那里没有用户可做的事，重渲染一次即可。
 */
export class ConversationStore {
  public constructor(private readonly storage: StorageArea) {}

  public async read(): Promise<PublishedConversation | null> {
    try {
      return parse((await this.storage.get(CONVERSATION_STORAGE_KEY))[CONVERSATION_STORAGE_KEY])
    } catch {
      return null
    }
  }

  public async write(value: PublishedConversation | null): Promise<boolean> {
    try {
      await this.storage.set({ [CONVERSATION_STORAGE_KEY]: value })
      return true
    } catch {
      return false
    }
  }
}
