import { allowWindowMessaging, onMessage, sendMessage } from 'webext-bridge/content-script'
import {
  MESSAGE_NAMESPACE,
  PROTOCOL_VERSION,
  SELLERSPRITE_KEYWORD_REVERSE_ACTION,
  TARGET_ACTIONS,
  isAllowedWebOrigin,
  isPingRequest,
  isSellerSpriteKeywordReverseRequest,
  isTargetRequest,
  type PingResponse,
  type ProtocolError,
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
  },
})