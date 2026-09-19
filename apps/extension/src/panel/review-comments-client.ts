import {
  MESSAGE_NAMESPACE,
  PROTOCOL_VERSION,
  SELLERSPRITE_REVIEW_COMMENTS_ACTION,
  isSellerSpriteReviewCommentsResponse,
  type SellerSpriteReviewCommentsInput,
} from '@cookie-amazon/protocol'
import { EXTENSION_RUNTIME_REQUEST_ACTION } from '../runtime-bridge'

const SELLERSPRITE_TARGET_ID = 'sellersprite'
const SUPPORTED_MARKETS = new Set(['US'])

export type ReviewCommentsResult =
  | { kind: 'data'; data: import('@cookie-amazon/protocol').SellerSpriteReviewCommentsData }
  | { kind: 'unsupported-market'; market: string }
  | { kind: 'not-logged-in' }
  | { kind: 'permission-required' }
  | { kind: 'failed'; reason: string }

type SendMessage = (message: unknown) => Promise<unknown>

const defaultSend: SendMessage = (message) => browser.runtime.sendMessage(message)
const requestId = (): string => 'review-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)

const buildInput = (asin: string, market: string): SellerSpriteReviewCommentsInput => ({
  asin,
  keyword: '',
  market: market.trim().toUpperCase(),
  pageNum: 1,
  pageSize: 50,
  reviewEndTime: null,
  reviewStartTime: null,
  order: { fieldName: 'date', sort: 1 },
  starList: [],
  typeList: [],
  variations: [],
})

const failureKind = (code: string): Extract<ReviewCommentsResult, {
  kind: 'not-logged-in' | 'permission-required' | 'failed'
}> => {
  if (code === 'TARGET_NOT_LOGGED_IN') return { kind: 'not-logged-in' }
  if (code === 'TARGET_PERMISSION_MISSING' || code === 'PERMISSION_REQUEST_DENIED') {
    return { kind: 'permission-required' }
  }
  return { kind: 'failed', reason: code }
}

/** 侧边栏只通过扩展 runtime 请求，Cookie 仍由 background 的 SellerSprite 页面请求复用。 */
export const fetchSellerSpriteReviews = async (
  asin: string,
  market: string,
  options: { send?: SendMessage } = {},
): Promise<ReviewCommentsResult> => {
  const normalizedMarket = market.trim().toUpperCase()
  if (!SUPPORTED_MARKETS.has(normalizedMarket)) return { kind: 'unsupported-market', market }
  const send = options.send ?? defaultSend
  let response: unknown
  try {
    response = await send({
      action: EXTENSION_RUNTIME_REQUEST_ACTION,
      request: {
        namespace: MESSAGE_NAMESPACE,
        kind: 'request',
        protocolVersion: PROTOCOL_VERSION,
        action: SELLERSPRITE_REVIEW_COMMENTS_ACTION,
        requestId: requestId(),
        payload: { targetId: SELLERSPRITE_TARGET_ID, input: buildInput(asin, normalizedMarket) },
      },
    })
  } catch (reason: unknown) {
    return { kind: 'failed', reason: reason instanceof Error ? reason.message : 'EXTENSION_UNAVAILABLE' }
  }
  if (!isSellerSpriteReviewCommentsResponse(response)) return { kind: 'failed', reason: 'TARGET_RESPONSE_INVALID' }
  if (!response.ok) return failureKind(response.error.code)
  return { kind: 'data', data: response.data }
}
