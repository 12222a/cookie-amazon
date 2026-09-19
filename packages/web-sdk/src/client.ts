import {
  createPingRequest,
  createSellerSpriteCompetitorRequest,
  createSellerSpriteProductSelectionRequest,
  createSellerSpriteCategoryNodesRequest,
  createSellerSpriteReviewCommentsRequest,
  createSellerSpriteKeywordMiningRequest,
  createSellerSpriteKeywordReverseRequest,
  createSellerSpriteMonthlyRequest,
  createSellerSpriteMarketResearchRequest,
  createSellerSpriteAbaPeriodsRequest,
  createSellerSpriteAbaResearchRequest,
  createTargetRequest,
  CONTENT_SCRIPT_PROBE_ACTION,
  isAllowedWebOrigin,
  isContentScriptProbeResponse,
  isPingResponse,
  isSellerSpriteCompetitorResponse,
  isSellerSpriteProductSelectionResponse,
  isSellerSpriteCategoryNodesResponse,
  isSellerSpriteReviewCommentsResponse,
  isSellerSpriteKeywordMiningResponse,
  isSellerSpriteKeywordReverseResponse,
  isSellerSpriteMonthlyResponse,
  isSellerSpriteMarketResearchResponse,
  isSellerSpriteAbaPeriodsResponse,
  isSellerSpriteAbaResearchInput,
  isSellerSpriteAbaResearchResponse,
  isTargetResponse,
  MESSAGE_NAMESPACE,
  TARGET_ACTIONS,
  COMPETITOR_RESEARCH_ACTION,
  PRODUCT_SELECTION_ACTION,
  SELLERSPRITE_CATEGORY_NODES_ACTION,
  SELLERSPRITE_REVIEW_COMMENTS_ACTION,
  KEYWORD_MINING_ACTION,
  SELLERSPRITE_KEYWORD_REVERSE_ACTION,
  SELLERSPRITE_MONTHLY_ACTION,
  SELLERSPRITE_MARKET_RESEARCH_ACTION,
  SELLERSPRITE_ABA_PERIODS_ACTION,
  SELLERSPRITE_ABA_RESEARCH_ACTION,
  type ExtensionStatus,
  type PingRequest,
  type SellerSpriteCompetitorData,
  type SellerSpriteCompetitorInput,
  type SellerSpriteCompetitorRequest,
  type SellerSpriteProductSelectionData,
  type SellerSpriteProductSelectionInput,
  type SellerSpriteProductSelectionRequest,
  type SellerSpriteCategoryNodesData,
  type SellerSpriteCategoryNodesInput,
  type SellerSpriteCategoryNode,
  type SellerSpriteCategoryNodesRequest,
  type SellerSpriteReviewCommentsData,
  type SellerSpriteReviewCommentsInput,
  type SellerSpriteReviewCommentsRequest,
  type SellerSpriteKeywordMiningData,
  type SellerSpriteKeywordMiningInput,
  type SellerSpriteKeywordMiningRequest,
  type SellerSpriteKeywordReverseData,
  type SellerSpriteKeywordReverseInput,
  type SellerSpriteKeywordReverseRequest,
  type SellerSpriteMonthlyData,
  type SellerSpriteMonthlyInput,
  type SellerSpriteMonthlyRequest,
  type SellerSpriteMarketResearchData,
  type SellerSpriteMarketResearchInput,
  type SellerSpriteMarketResearchRequest,
  type SellerSpriteAbaPeriodsData,
  type SellerSpriteAbaPeriodsRequest,
  type SellerSpriteAbaResearchData,
  type SellerSpriteAbaResearchInput,
  type SellerSpriteAbaResearchRequest,
  type TargetAction,
  type TargetDescriptor,
  type TargetListData,
  type TargetLoginData,
  type TargetPermissionData,
  type TargetProfileData,
  type TargetRequest,
  type TargetStatusData,
} from '@cookie-amazon/protocol'
import { WebSdkError } from './errors'
import { sendMessage as sendBridgeMessage, setNamespace } from 'webext-bridge/window'

export type WebSdkOptions = { timeoutMs?: number }
export type ContentScriptProbeResult = {
  available: boolean
  extensionVersion?: string
}
const DEFAULT_TIMEOUT_MS = 5_000
const createRequestId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2)}`
export const SELLERSPRITE_SESSION_EXPIRED_EVENT = 'cookie-amazon:sellersprite-session-expired' as const

export const probeContentScript = async (options: WebSdkOptions = {}): Promise<ContentScriptProbeResult> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  const requestId = createRequestId()
  const timeoutMs = options.timeoutMs ?? 3_000
  return new Promise<ContentScriptProbeResult>((resolve) => {
    let settled = false
    const complete = (result: ContentScriptProbeResult): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      window.removeEventListener('message', onMessage)
      resolve(result)
    }
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (event.source !== window || event.origin !== window.location.origin) return
      if (!isContentScriptProbeResponse(event.data) || event.data.requestId !== requestId) return
      complete({ available: true, extensionVersion: event.data.extensionVersion })
    }
    const timeoutId = window.setTimeout(() => complete({ available: false }), timeoutMs)
    window.addEventListener('message', onMessage)
    window.postMessage({
      namespace: MESSAGE_NAMESPACE,
      action: CONTENT_SCRIPT_PROBE_ACTION,
      requestId,
    }, window.location.origin)
  })
}

const RUNTIME_REQUEST_ACTION = 'COOKIE_AMAZON_RUNTIME_REQUEST'
const RUNTIME_RESPONSE_ACTION = 'COOKIE_AMAZON_RUNTIME_RESPONSE'
let bridgeInitialized = false

type RuntimeBridgeRequest = PingRequest | TargetRequest | SellerSpriteKeywordReverseRequest
  | SellerSpriteMonthlyRequest | SellerSpriteMarketResearchRequest | SellerSpriteCompetitorRequest
  | SellerSpriteProductSelectionRequest | SellerSpriteCategoryNodesRequest
  | SellerSpriteReviewCommentsRequest | SellerSpriteKeywordMiningRequest
  | SellerSpriteAbaPeriodsRequest | SellerSpriteAbaResearchRequest

const sendBridgeMessageWithTimeout = async (
  action: string,
  request: RuntimeBridgeRequest,
  timeoutMs: number,
): Promise<unknown> => new Promise((resolve, reject) => {
  let settled = false
  const complete = (callback: () => void): void => {
    if (settled) return
    settled = true
    window.clearTimeout(timeoutId)
    callback()
  }
  const timeoutId = window.setTimeout(
    () => complete(() => reject(new WebSdkError('TIMEOUT'))),
    timeoutMs,
  )
  if (!bridgeInitialized) {
    setNamespace(MESSAGE_NAMESPACE)
    bridgeInitialized = true
  }
  void sendBridgeMessage(action, request as never, 'content-script')
    .then((response) => complete(() => resolve(response)))
    .catch(() => complete(() => reject(new WebSdkError('EXTENSION_UNAVAILABLE'))))
})

const requestWithTimeout = async (
  _action: string,
  request: RuntimeBridgeRequest,
  timeoutMs: number,
): Promise<unknown> => new Promise((resolve, reject) => {
  if (typeof window.postMessage !== 'function') {
    void sendBridgeMessageWithTimeout(_action, request, timeoutMs).then(resolve).catch(reject)
    return
  }
  let timeoutId: number | undefined
  const onMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== window || event.origin !== window.location.origin) return
    const data = event.data
    if (typeof data !== 'object' || data === null
      || (data as { action?: unknown }).action !== RUNTIME_RESPONSE_ACTION
      || (data as { requestId?: unknown }).requestId !== request.requestId) return
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    window.removeEventListener('message', onMessage)
    const response = (data as { response?: unknown }).response
    if (response === undefined) reject(new WebSdkError('INVALID_MESSAGE'))
    else resolve(response)
  }
  const directTimeoutMs = _action === 'PING' || TARGET_ACTIONS.includes(_action as TargetAction)
    ? Math.min(timeoutMs, 1_200)
    : timeoutMs
  timeoutId = window.setTimeout(() => {
    window.removeEventListener('message', onMessage)
    if (_action === 'PING' || TARGET_ACTIONS.includes(_action as TargetAction)) {
      void sendBridgeMessageWithTimeout(
        _action,
        request,
        Math.max(1, timeoutMs - directTimeoutMs),
      )
        .then(resolve)
        .catch(reject)
      return
    }
    reject(new WebSdkError('TIMEOUT'))
  }, directTimeoutMs)
  window.addEventListener('message', onMessage)
  window.postMessage({
    namespace: MESSAGE_NAMESPACE,
    action: RUNTIME_REQUEST_ACTION,
    request,
  }, window.location.origin)
})

export const ping = async (options: WebSdkOptions = {}): Promise<ExtensionStatus> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  const request = createPingRequest(createRequestId())
  try {
    const response = await requestWithTimeout('PING', request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isPingResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw protocolError(response.error)
    return response.data
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

const sendTargetRequest = async <T>(
  action: TargetAction,
  targetId: string | undefined,
  options: WebSdkOptions,
): Promise<T> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  const request = createTargetRequest(action, createRequestId(), targetId)
  try {
    const response = await requestWithTimeout(action, request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isTargetResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw protocolError(response.error)
    return response.data as T
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

export const listTargets = async (options: WebSdkOptions = {}): Promise<TargetListData['targets']> =>
  (await sendTargetRequest<TargetListData>('LIST_TARGETS', undefined, options)).targets

export const getTargetStatus = async (targetId: string, options: WebSdkOptions = {}): Promise<TargetStatusData> =>
  sendTargetRequest<TargetStatusData>('GET_TARGET_STATUS', targetId, options)

export const requestTargetPermission = async (targetId: string, options: WebSdkOptions = {}): Promise<TargetPermissionData> =>
  sendTargetRequest<TargetPermissionData>('REQUEST_TARGET_PERMISSION', targetId, options)

export const removeTargetPermission = async (targetId: string, options: WebSdkOptions = {}): Promise<TargetPermissionData> =>
  sendTargetRequest<TargetPermissionData>('REMOVE_TARGET_PERMISSION', targetId, options)

export const checkLogin = async (targetId: string, options: WebSdkOptions = {}): Promise<TargetLoginData> =>
  sendTargetRequest<TargetLoginData>('CHECK_LOGIN', targetId, options)

export const getProfile = async (targetId: string, options: WebSdkOptions = {}): Promise<TargetProfileData> =>
  sendTargetRequest<TargetProfileData>('GET_PROFILE', targetId, options)

export const reverseSellerSpriteKeywords = async (
  input: SellerSpriteKeywordReverseInput,
  options: WebSdkOptions = {},
): Promise<SellerSpriteKeywordReverseData> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  const request = createSellerSpriteKeywordReverseRequest(createRequestId(), 'sellersprite', input)
  try {
    const response = await requestWithTimeout(
      SELLERSPRITE_KEYWORD_REVERSE_ACTION,
      request,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
    if (!isSellerSpriteKeywordReverseResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw protocolError(response.error)
    return response.data
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

export const researchSellerSpriteCompetitors = async (
  input: SellerSpriteCompetitorInput,
  options: WebSdkOptions = {},
): Promise<SellerSpriteCompetitorData> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  const request = createSellerSpriteCompetitorRequest(createRequestId(), 'sellersprite', input)
  try {
    const response = await requestWithTimeout(COMPETITOR_RESEARCH_ACTION, request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isSellerSpriteCompetitorResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw protocolError(response.error)
    return response.data
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

export const selectSellerSpriteProducts = async (
  input: SellerSpriteProductSelectionInput,
  options: WebSdkOptions = {},
): Promise<SellerSpriteProductSelectionData> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  const request = createSellerSpriteProductSelectionRequest(createRequestId(), 'sellersprite', input)
  try {
    const response = await requestWithTimeout(PRODUCT_SELECTION_ACTION, request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isSellerSpriteProductSelectionResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw protocolError(response.error)
    return response.data
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

export const listSellerSpriteCategoryNodes = async (
  input: SellerSpriteCategoryNodesInput,
  options: WebSdkOptions = {},
): Promise<SellerSpriteCategoryNodesData> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  const request = createSellerSpriteCategoryNodesRequest(createRequestId(), 'sellersprite', input)
  try {
    const response = await requestWithTimeout(SELLERSPRITE_CATEGORY_NODES_ACTION, request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isSellerSpriteCategoryNodesResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw protocolError(response.error)
    return response.data
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

export const listSellerSpriteReviewComments = async (
  input: SellerSpriteReviewCommentsInput,
  options: WebSdkOptions = {},
): Promise<SellerSpriteReviewCommentsData> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  const request = createSellerSpriteReviewCommentsRequest(createRequestId(), 'sellersprite', input)
  try {
    const response = await requestWithTimeout(SELLERSPRITE_REVIEW_COMMENTS_ACTION, request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isSellerSpriteReviewCommentsResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw protocolError(response.error)
    return response.data
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

export const readSellerSpriteMonthly = async (
  input: SellerSpriteMonthlyInput,
  options: WebSdkOptions = {},
): Promise<SellerSpriteMonthlyData> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  const request = createSellerSpriteMonthlyRequest(createRequestId(), 'sellersprite', input)
  try {
    const response = await requestWithTimeout(SELLERSPRITE_MONTHLY_ACTION, request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isSellerSpriteMonthlyResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw protocolError(response.error)
    return response.data
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

export const researchSellerSpriteMarket = async (
  input: SellerSpriteMarketResearchInput,
  options: WebSdkOptions = {},
): Promise<SellerSpriteMarketResearchData> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  const request = createSellerSpriteMarketResearchRequest(createRequestId(), 'sellersprite', input)
  try {
    const response = await requestWithTimeout(SELLERSPRITE_MARKET_RESEARCH_ACTION, request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isSellerSpriteMarketResearchResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw protocolError(response.error)
    return response.data
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

const protocolError = (error: {
  code: import('@cookie-amazon/protocol').ProtocolErrorCode
  httpStatus?: number
  targetCode?: string | number
  targetMessage?: string
}): WebSdkError => {
  const sdkError = new WebSdkError(error.code, {
    ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
    ...(error.targetCode === undefined ? {} : { targetCode: error.targetCode }),
    ...(error.targetMessage === undefined ? {} : { targetMessage: error.targetMessage }),
  })
  if (error.code === 'TARGET_NOT_LOGGED_IN' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(SELLERSPRITE_SESSION_EXPIRED_EVENT, { detail: sdkError }))
  }
  return sdkError
}

export const listSellerSpriteAbaPeriods = async (
  options: WebSdkOptions = {},
): Promise<SellerSpriteAbaPeriodsData> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  const request = createSellerSpriteAbaPeriodsRequest(createRequestId(), 'sellersprite')
  try {
    const response = await requestWithTimeout(SELLERSPRITE_ABA_PERIODS_ACTION, request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isSellerSpriteAbaPeriodsResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw protocolError(response.error)
    return response.data
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

export const researchSellerSpriteAba = async (
  input: SellerSpriteAbaResearchInput,
  options: WebSdkOptions = {},
): Promise<SellerSpriteAbaResearchData> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  if (!isSellerSpriteAbaResearchInput(input)) throw new WebSdkError('INVALID_MESSAGE')
  const request = createSellerSpriteAbaResearchRequest(createRequestId(), 'sellersprite', input)
  try {
    const response = await requestWithTimeout(SELLERSPRITE_ABA_RESEARCH_ACTION, request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isSellerSpriteAbaResearchResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw protocolError(response.error)
    return response.data
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

export const mineSellerSpriteKeywords = async (
  input: SellerSpriteKeywordMiningInput,
  options: WebSdkOptions = {},
): Promise<SellerSpriteKeywordMiningData> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  const request = createSellerSpriteKeywordMiningRequest(createRequestId(), 'sellersprite', input)
  try {
    const response = await requestWithTimeout(KEYWORD_MINING_ACTION, request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isSellerSpriteKeywordMiningResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw protocolError(response.error)
    return response.data
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

export const getExtensionStatus = ping
export type {
  SellerSpriteCompetitorData,
  SellerSpriteCompetitorInput,
  SellerSpriteProductSelectionData,
  SellerSpriteProductSelectionInput,
  SellerSpriteCategoryNodesData,
  SellerSpriteCategoryNodesInput,
  SellerSpriteCategoryNode,
  SellerSpriteReviewCommentsData,
  SellerSpriteReviewCommentsInput,
  SellerSpriteKeywordMiningData,
  SellerSpriteKeywordMiningInput,
  SellerSpriteMonthlyData,
  SellerSpriteMonthlyInput,
  SellerSpriteMarketResearchData,
  SellerSpriteMarketResearchInput,
  SellerSpriteAbaPeriodsData,
  SellerSpriteAbaResearchData,
  SellerSpriteAbaResearchInput,
  SellerSpriteKeywordReverseData,
  SellerSpriteKeywordReverseInput,
  TargetDescriptor,
}