/**
 * 侧边栏取词位数据的通道。
 *
 * 侧边栏是扩展页面（chrome-extension://），不在 web-sdk 的网页来源白名单里，
 * 所以走扩展自己的 runtime 通道——background 收到同样的消息后做受限请求与字段裁剪。
 * 这里只负责组装请求与把错误翻译成用户能照着做的指引，不做任何网络访问。
 */
import {
  MESSAGE_NAMESPACE,
  PROTOCOL_VERSION,
  SELLERSPRITE_KEYWORD_REVERSE_ACTION,
  isSellerSpriteKeywordReverseResponse,
  type SellerSpriteKeywordReverseData,
  type SellerSpriteKeywordReverseInput,
} from '@cookie-amazon/protocol'
import { EXTENSION_RUNTIME_REQUEST_ACTION } from '../runtime-bridge'
import {
  describeKeywordPositions,
  type KeywordPositionRow,
} from './keyword-positions'

const SELLERSPRITE_TARGET_ID = 'sellersprite'
/** 目前只映射美国站（B9 决定）。其他站点在这里就被挡住，不发出请求。 */
const KEYWORD_MARKET_IDS: Readonly<Record<string, number>> = { US: 1 }
export type KeywordPositionResult =
  | { kind: 'rows'; rows: KeywordPositionRow[] }
  | { kind: 'unsupported-market'; market: string }
  | { kind: 'not-logged-in' }
  | { kind: 'permission-required' }
  | { kind: 'failed'; reason: string }
type SendMessage = (message: unknown) => Promise<unknown>
const defaultSend: SendMessage = (message) => browser.runtime.sendMessage(message)
const requestId = (): string => `panel-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
const failureKind = (code: string): KeywordPositionResult => {
  if (code === 'TARGET_NOT_LOGGED_IN') return { kind: 'not-logged-in' }
  if (code === 'TARGET_PERMISSION_MISSING' || code === 'PERMISSION_REQUEST_DENIED') {
    return { kind: 'permission-required' }
  }
  return { kind: 'failed', reason: code }
}
const buildInput = (asin: string, marketId: number): SellerSpriteKeywordReverseInput => ({
  asin,
  marketId,
  month: '',
  forceReStat: false,
  badges: [],
  limit: 50,
})
/**
 * 取某个 ASIN 的词位。任何异常都翻译成结果对象，不向调用方抛错——
 * 面板要能一直显示，不能因为一次取数失败就白屏。
 */
export const requestKeywordPositions = async (
  asin: string,
  market: string,
  options: { send?: SendMessage } = {},
): Promise<KeywordPositionResult> => {
  const marketId = KEYWORD_MARKET_IDS[market.trim().toUpperCase()]
  if (marketId === undefined) return { kind: 'unsupported-market', market }
  const send = options.send ?? defaultSend
  let response: unknown
  try {
    response = await send({
      action: EXTENSION_RUNTIME_REQUEST_ACTION,
      request: {
        namespace: MESSAGE_NAMESPACE,
        kind: 'request',
        protocolVersion: PROTOCOL_VERSION,
        action: SELLERSPRITE_KEYWORD_REVERSE_ACTION,
        requestId: requestId(),
        payload: { targetId: SELLERSPRITE_TARGET_ID, input: buildInput(asin, marketId) },
      },
    })
  } catch (reason: unknown) {
    return { kind: 'failed', reason: reason instanceof Error ? reason.message : 'EXTENSION_UNAVAILABLE' }
  }
  if (!isSellerSpriteKeywordReverseResponse(response)) {
    return { kind: 'failed', reason: 'TARGET_RESPONSE_INVALID' }
  }
  if (!response.ok) return failureKind(response.error.code)
  return { kind: 'rows', rows: describeKeywordPositions(response.data as SellerSpriteKeywordReverseData) }
}
