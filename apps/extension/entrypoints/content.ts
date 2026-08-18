import { allowWindowMessaging, onMessage, sendMessage } from 'webext-bridge/content-script'
import {
  MESSAGE_NAMESPACE,
  PROTOCOL_VERSION,
  COMPETITOR_RESEARCH_ACTION,
  PRODUCT_SELECTION_ACTION,
  MARKET_SELECTION_ACTION,
  KEYWORD_PRODUCT_RESEARCH_ACTION,
  KEYWORD_MINING_ACTION,
  SELLERSPRITE_KEYWORD_REVERSE_ACTION,
  TARGET_ACTIONS,
  isAllowedWebOrigin,
  isPingRequest,
  isSellerSpriteCompetitorRequest,
  isSellerSpriteProductSelectionRequest,
  isSellerSpriteHtmlSessionRequest,
  isSellerSpriteKeywordMiningRequest,
  isSellerSpriteKeywordReverseRequest,
  isTargetRequest,
  type PingResponse,
  type ProtocolError,
  type SellerSpriteCompetitorResponse,
  type SellerSpriteKeywordReverseResponse,
  type TargetResponse,
} from '@cookie-amazon/protocol'

const invalidMessage = (requestId = 'unknown'): ProtocolError => ({
  namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
  requestId, ok: false, error: { code: 'INVALID_MESSAGE' },
})

const extensionUnavailable = (requestId: string): ProtocolError => ({
  namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
  requestId, ok: false, error: { code: 'EXTENSION_UNAVAILABLE' },
})

const relayTargetMessage = async ({ data }: { data: unknown }): Promise<TargetResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isTargetRequest(data)) return invalidMessage()
  try {
    return await sendMessage(data.action, data, 'background') as unknown as TargetResponse
  } catch {
    return extensionUnavailable(data.requestId)
  }
}

const relayKeywordReverseMessage = async ({ data }: { data: unknown }): Promise<SellerSpriteKeywordReverseResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteKeywordReverseRequest(data)) return invalidMessage()
  try {
    return await sendMessage(data.action, data, 'background') as unknown as SellerSpriteKeywordReverseResponse
  } catch {
    return extensionUnavailable(data.requestId)
  }
}

const relayCompetitorMessage = async ({ data }: { data: unknown }): Promise<SellerSpriteCompetitorResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteCompetitorRequest(data)) return invalidMessage()
  try {
    return await sendMessage(data.action, data, 'background') as unknown as SellerSpriteCompetitorResponse
  } catch {
    return extensionUnavailable(data.requestId)
  }
}
const relayProductSelectionMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteProductSelectionResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteProductSelectionRequest(data)) return invalidMessage()
  try {
    return await sendMessage(data.action, data, 'background') as unknown as import('@cookie-amazon/protocol').SellerSpriteProductSelectionResponse
  } catch {
    return extensionUnavailable(data.requestId)
  }
}

const relayHtmlSessionMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteHtmlSessionResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteHtmlSessionRequest(data)) return invalidMessage()
  try { return await sendMessage(data.action, data, 'background') as unknown as import('@cookie-amazon/protocol').SellerSpriteHtmlSessionResponse } catch { return extensionUnavailable(data.requestId) }
}

const relayKeywordMiningMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteKeywordMiningResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteKeywordMiningRequest(data)) return invalidMessage()
  try { return await sendMessage(data.action, data, 'background') as unknown as import('@cookie-amazon/protocol').SellerSpriteKeywordMiningResponse } catch { return extensionUnavailable(data.requestId) }
}

export default defineContentScript({
  matches: ['http://localhost:5173/*'],
  runAt: 'document_start',
  main() {
    allowWindowMessaging(MESSAGE_NAMESPACE)
    onMessage('PING', async ({ data }: { data: unknown }): Promise<PingResponse> => {
      if (!isAllowedWebOrigin(location.origin) || !isPingRequest(data)) return invalidMessage()
      try {
        return await sendMessage('PING', data, 'background') as unknown as PingResponse
      } catch {
        return extensionUnavailable(data.requestId)
      }
    })
    for (const action of TARGET_ACTIONS) onMessage(action, relayTargetMessage)
    onMessage(SELLERSPRITE_KEYWORD_REVERSE_ACTION, relayKeywordReverseMessage)
    onMessage(COMPETITOR_RESEARCH_ACTION, relayCompetitorMessage)
    onMessage(PRODUCT_SELECTION_ACTION, relayProductSelectionMessage)
    onMessage(KEYWORD_MINING_ACTION, relayKeywordMiningMessage)
    onMessage(MARKET_SELECTION_ACTION, relayHtmlSessionMessage)
    onMessage(KEYWORD_PRODUCT_RESEARCH_ACTION, relayHtmlSessionMessage)
  },
})