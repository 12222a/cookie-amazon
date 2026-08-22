import { allowWindowMessaging, onMessage, sendMessage } from 'webext-bridge/content-script'
import {
  MESSAGE_NAMESPACE,
  PROTOCOL_VERSION,
  CONTENT_SCRIPT_PROBE_RESPONSE,
  CONTENT_SCRIPT_RUNTIME_PROBE_ACTION,
  CONTENT_SCRIPT_RUNTIME_PROBE_RESPONSE,
  COMPETITOR_RESEARCH_ACTION,
  PRODUCT_SELECTION_ACTION,
  SELLERSPRITE_CATEGORY_NODES_ACTION,
  SELLERSPRITE_REVIEW_COMMENTS_ACTION,
  MARKET_SELECTION_ACTION,
  KEYWORD_PRODUCT_RESEARCH_ACTION,
  KEYWORD_MINING_ACTION,
  SELLERSPRITE_KEYWORD_REVERSE_ACTION,
  SELLERSPRITE_MONTHLY_ACTION,
  SELLERSPRITE_MARKET_RESEARCH_ACTION,
  SELLERSPRITE_ABA_PERIODS_ACTION,
  SELLERSPRITE_ABA_RESEARCH_ACTION,
  TARGET_ACTIONS,
  isAllowedWebOrigin,
  isContentScriptProbeRequest,
  isPingRequest,
  isSellerSpriteCompetitorRequest,
  isSellerSpriteProductSelectionRequest,
  isSellerSpriteCategoryNodesRequest,
  isSellerSpriteReviewCommentsRequest,
  isSellerSpriteHtmlSessionRequest,
  isSellerSpriteKeywordMiningRequest,
  isSellerSpriteKeywordReverseRequest,
  isSellerSpriteMonthlyRequest,
  isSellerSpriteMarketResearchRequest,
  isSellerSpriteAbaPeriodsRequest,
  isSellerSpriteAbaResearchRequest,
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

const relayCategoryNodesMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteCategoryNodesResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteCategoryNodesRequest(data)) return invalidMessage()
  try { return await sendMessage(data.action, data, 'background') as unknown as import('@cookie-amazon/protocol').SellerSpriteCategoryNodesResponse } catch { return extensionUnavailable(data.requestId) }
}

const relayReviewCommentsMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteReviewCommentsResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteReviewCommentsRequest(data)) return invalidMessage()
  try { return await sendMessage(data.action, data, 'background') as unknown as import('@cookie-amazon/protocol').SellerSpriteReviewCommentsResponse } catch { return extensionUnavailable(data.requestId) }
}

const relayHtmlSessionMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteHtmlSessionResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteHtmlSessionRequest(data)) return invalidMessage()
  try { return await sendMessage(data.action, data, 'background') as unknown as import('@cookie-amazon/protocol').SellerSpriteHtmlSessionResponse } catch { return extensionUnavailable(data.requestId) }
}

const relayMonthlyMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteMonthlyResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteMonthlyRequest(data)) return invalidMessage()
  try { return await sendMessage(data.action, data, 'background') as unknown as import('@cookie-amazon/protocol').SellerSpriteMonthlyResponse } catch { return extensionUnavailable(data.requestId) }
}

const relayMarketResearchMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteMarketResearchResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteMarketResearchRequest(data)) return invalidMessage()
  try { return await sendMessage(data.action, data, 'background') as unknown as import('@cookie-amazon/protocol').SellerSpriteMarketResearchResponse } catch { return extensionUnavailable(data.requestId) }
}

const relayAbaPeriodsMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteAbaPeriodsResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteAbaPeriodsRequest(data)) return invalidMessage()
  try { return await sendMessage(data.action, data, 'background') as unknown as import('@cookie-amazon/protocol').SellerSpriteAbaPeriodsResponse } catch { return extensionUnavailable(data.requestId) }
}

const relayAbaResearchMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteAbaResearchResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteAbaResearchRequest(data)) return invalidMessage()
  try { return await sendMessage(data.action, data, 'background') as unknown as import('@cookie-amazon/protocol').SellerSpriteAbaResearchResponse } catch { return extensionUnavailable(data.requestId) }
}

const relayKeywordMiningMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteKeywordMiningResponse> => {
  if (!isAllowedWebOrigin(location.origin) || !isSellerSpriteKeywordMiningRequest(data)) return invalidMessage()
  try { return await sendMessage(data.action, data, 'background') as unknown as import('@cookie-amazon/protocol').SellerSpriteKeywordMiningResponse } catch { return extensionUnavailable(data.requestId) }
}

export default defineContentScript({
  matches: ['http://localhost:5173/*', 'http://127.0.0.1:5173/*'],
  runAt: 'document_start',
  main() {
    browser.runtime.onMessage.addListener((message: unknown) =>
      message === CONTENT_SCRIPT_RUNTIME_PROBE_ACTION
        ? Promise.resolve(CONTENT_SCRIPT_RUNTIME_PROBE_RESPONSE)
        : false)
    allowWindowMessaging(MESSAGE_NAMESPACE)
    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== location.origin || !isAllowedWebOrigin(event.origin)) return
      if (!isContentScriptProbeRequest(event.data)) return
      window.postMessage({
        namespace: MESSAGE_NAMESPACE,
        action: CONTENT_SCRIPT_PROBE_RESPONSE,
        requestId: event.data.requestId,
        extensionVersion: browser.runtime.getManifest().version,
      }, location.origin)
    })
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
    onMessage(SELLERSPRITE_MONTHLY_ACTION, relayMonthlyMessage)
    onMessage(SELLERSPRITE_MARKET_RESEARCH_ACTION, relayMarketResearchMessage)
    onMessage(SELLERSPRITE_ABA_PERIODS_ACTION, relayAbaPeriodsMessage)
    onMessage(SELLERSPRITE_ABA_RESEARCH_ACTION, relayAbaResearchMessage)
    onMessage(COMPETITOR_RESEARCH_ACTION, relayCompetitorMessage)
    onMessage(PRODUCT_SELECTION_ACTION, relayProductSelectionMessage)
    onMessage(SELLERSPRITE_CATEGORY_NODES_ACTION, relayCategoryNodesMessage)
    onMessage(SELLERSPRITE_REVIEW_COMMENTS_ACTION, relayReviewCommentsMessage)
    onMessage(KEYWORD_MINING_ACTION, relayKeywordMiningMessage)
    onMessage(MARKET_SELECTION_ACTION, relayHtmlSessionMessage)
    onMessage(KEYWORD_PRODUCT_RESEARCH_ACTION, relayHtmlSessionMessage)
  },
})