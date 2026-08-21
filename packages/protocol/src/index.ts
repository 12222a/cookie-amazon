export const PROTOCOL_VERSION = 1 as const
export const MESSAGE_NAMESPACE = 'cookie-amazon-platform' as const
export const WEB_ORIGIN = 'http://localhost:5173' as const
export const WEB_ORIGINS = [WEB_ORIGIN, 'http://127.0.0.1:5173'] as const
export const REMOTE_CONFIG_ORIGIN = 'http://localhost:8787' as const
export const PING_ACTION = 'PING' as const
export const CONTENT_SCRIPT_PROBE_ACTION = 'COOKIE_AMAZON_CONTENT_SCRIPT_PROBE' as const
export const CONTENT_SCRIPT_PROBE_RESPONSE = 'COOKIE_AMAZON_CONTENT_SCRIPT_READY' as const
export const CONTENT_SCRIPT_RUNTIME_PROBE_ACTION = 'COOKIE_AMAZON_RUNTIME_PROBE' as const
export const CONTENT_SCRIPT_RUNTIME_PROBE_RESPONSE = 'COOKIE_AMAZON_RUNTIME_READY' as const
export const CAPABILITIES = [
  'PING',
  'LIST_TARGETS',
  'GET_TARGET_STATUS',
  'REQUEST_TARGET_PERMISSION',
  'REMOVE_TARGET_PERMISSION',
  'CHECK_LOGIN',
  'GET_PROFILE',
  'SELLERSPRITE_KEYWORD_REVERSE',
  'SELLERSPRITE_MONTHLY',
  'SELLERSPRITE_MARKET_RESEARCH',
  'SELLERSPRITE_ABA_PERIODS',
  'SELLERSPRITE_ABA_RESEARCH',
  'COMPETITOR_RESEARCH',
  'PRODUCT_SELECTION',
  'MARKET_SELECTION',
  'KEYWORD_PRODUCT_RESEARCH',
  'KEYWORD_MINING',
] as const

export type Capability = (typeof CAPABILITIES)[number]
export type ProtocolErrorCode =
  | 'INVALID_ORIGIN'
  | 'INVALID_MESSAGE'
  | 'UNSUPPORTED_PROTOCOL'
  | 'UNKNOWN_ACTION'
  | 'EXTENSION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNKNOWN_TARGET'
  | 'TARGET_DISABLED'
  | 'TARGET_PERMISSION_MISSING'
  | 'PERMISSION_REQUEST_DENIED'
  | 'PERMISSION_REQUIRES_EXTENSION_UI'
  | 'TARGET_OPERATION_UNKNOWN'
  | 'OPERATION_DISABLED'
  | 'FEATURE_DISABLED'
  | 'TARGET_RESPONSE_INVALID'
  | 'TARGET_RATE_LIMITED'
  | 'TARGET_API_ERROR'
  | 'NETWORK_ERROR'
  | 'TARGET_NOT_LOGGED_IN'
export type PingRequest = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'request'
  protocolVersion: typeof PROTOCOL_VERSION
  action: typeof PING_ACTION
  requestId: string
}

export type ExtensionStatus = {
  connected: true
  extensionVersion: string
  protocolVersion: typeof PROTOCOL_VERSION
  capabilities: readonly Capability[]
}

export type PingSuccess = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'response'
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  ok: true
  data: ExtensionStatus
}

export type ProtocolError = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'response'
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  ok: false
  error: {
    code: ProtocolErrorCode
    targetCode?: string | number
    targetMessage?: string
  }
}

export type PingResponse = PingSuccess | ProtocolError

export type ContentScriptProbeRequest = {
  namespace: typeof MESSAGE_NAMESPACE
  action: typeof CONTENT_SCRIPT_PROBE_ACTION
  requestId: string
}

export type ContentScriptProbeResponse = {
  namespace: typeof MESSAGE_NAMESPACE
  action: typeof CONTENT_SCRIPT_PROBE_RESPONSE
  requestId: string
  extensionVersion: string
}

export const isContentScriptProbeRequest = (value: unknown): value is ContentScriptProbeRequest =>
  isRecord(value)
  && value.namespace === MESSAGE_NAMESPACE
  && value.action === CONTENT_SCRIPT_PROBE_ACTION
  && typeof value.requestId === 'string'
  && value.requestId.length > 0

export const isContentScriptProbeResponse = (value: unknown): value is ContentScriptProbeResponse =>
  isRecord(value)
  && value.namespace === MESSAGE_NAMESPACE
  && value.action === CONTENT_SCRIPT_PROBE_RESPONSE
  && typeof value.requestId === 'string'
  && value.requestId.length > 0
  && typeof value.extensionVersion === 'string'
  && value.extensionVersion.length > 0

export const isAllowedWebOrigin = (origin: string): boolean =>
  WEB_ORIGINS.some((allowedOrigin) => origin === allowedOrigin)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const isPingRequest = (value: unknown): value is PingRequest => {
  if (!isRecord(value)) return false
  return value.namespace === MESSAGE_NAMESPACE
    && value.kind === 'request'
    && value.protocolVersion === PROTOCOL_VERSION
    && value.action === PING_ACTION
    && typeof value.requestId === 'string'
    && value.requestId.length > 0
}

export const isPingResponse = (value: unknown): value is PingResponse => {
  if (!isRecord(value)) return false
  if (value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'response') return false
  if (value.protocolVersion !== PROTOCOL_VERSION || typeof value.requestId !== 'string') return false
  if (value.ok === true) {
    const data = value.data
    return isRecord(data)
      && data.connected === true
      && typeof data.extensionVersion === 'string'
      && data.protocolVersion === PROTOCOL_VERSION
      && Array.isArray(data.capabilities)
      && data.capabilities.every((item) => CAPABILITIES.includes(item as Capability))
  }
  if (value.ok !== false || !isRecord(value.error)) return false
  return typeof value.error.code === 'string'
}

export const createPingRequest = (requestId: string): PingRequest => ({
  namespace: MESSAGE_NAMESPACE,
  kind: 'request',
  protocolVersion: PROTOCOL_VERSION,
  action: PING_ACTION,
  requestId,
})

export const TARGET_ACTIONS = [
  'LIST_TARGETS',
  'GET_TARGET_STATUS',
  'REQUEST_TARGET_PERMISSION',
  'REMOVE_TARGET_PERMISSION',
  'CHECK_LOGIN',
  'GET_PROFILE',
] as const

export type TargetAction = (typeof TARGET_ACTIONS)[number]
export type TargetIdPayload = { targetId: string }

export type TargetRequest = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'request'
  protocolVersion: typeof PROTOCOL_VERSION
  action: TargetAction
  requestId: string
  payload?: TargetIdPayload
}

export type TargetState = 'unknown' | 'disabled' | 'permission-required' | 'ready'

export type TargetDescriptor = {
  targetId: string
  displayName: string
  origin: `https://${string}`
  enabled: boolean
  status: Exclude<TargetState, 'unknown'>
}

export type TargetListData = { targets: readonly TargetDescriptor[] }
export type TargetStatusData = TargetDescriptor & {
  granted: boolean
  capabilities: readonly Capability[]
}
export type TargetPermissionData = {
  targetId: string
  granted: boolean
  status: Exclude<TargetState, 'unknown'>
}
export type TargetConnectionState =
  | 'NOT_INSTALLED'
  | 'NO_COOKIE'
  | 'COOKIE_FOUND'
  | 'BACKGROUND_OK'
  | 'BACKGROUND_FAILED'
  | 'PAGE_CONTEXT_OK'
  | 'PAGE_CONTEXT_FAILED'
  | 'NEED_LOGIN'
export type TargetConnectionMode = 'background' | 'page'
export type TargetLoginData = {
  targetId: string
  loggedIn: boolean
  connectionState?: TargetConnectionState
  connectionMode?: TargetConnectionMode
  cookieFound?: boolean
}
export type TargetProfile = {
  userId: string
  displayName: string
}
export type TargetProfileData = {
  targetId: string
  profile: TargetProfile
}
export type TargetResponseData = TargetListData | TargetStatusData | TargetPermissionData | TargetLoginData | TargetProfileData
export type TargetSuccess = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'response'
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  action: TargetAction
  ok: true
  data: TargetResponseData
}
export type TargetResponse = TargetSuccess | ProtocolError

export const createTargetRequest = (
  action: TargetAction,
  requestId: string,
  targetId?: string,
): TargetRequest => ({
  namespace: MESSAGE_NAMESPACE,
  kind: 'request',
  protocolVersion: PROTOCOL_VERSION,
  action,
  requestId,
  ...(targetId === undefined ? {} : { payload: { targetId } }),
})

const isTargetAction = (value: unknown): value is TargetAction =>
  TARGET_ACTIONS.includes(value as TargetAction)

const isTargetIdPayload = (value: unknown): value is TargetIdPayload =>
  isRecord(value)
  && Object.keys(value).length === 1
  && typeof value.targetId === 'string'
  && value.targetId.length > 0
  && value.targetId.length <= 64

export const isTargetRequest = (value: unknown): value is TargetRequest => {
  if (!isRecord(value)) return false
  if (value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'request') return false
  if (value.protocolVersion !== PROTOCOL_VERSION || typeof value.requestId !== 'string' || value.requestId.length === 0) return false
  if (!isTargetAction(value.action)) return false
  if (value.action === 'LIST_TARGETS') return value.payload === undefined
  return isTargetIdPayload(value.payload)
}

const isTargetState = (value: unknown): value is Exclude<TargetState, 'unknown'> =>
  value === 'disabled' || value === 'permission-required' || value === 'ready'

const isTargetDescriptor = (value: unknown): value is TargetDescriptor =>
  isRecord(value)
  && typeof value.targetId === 'string'
  && typeof value.displayName === 'string'
  && typeof value.origin === 'string'
  && value.origin.startsWith('https://')
  && typeof value.enabled === 'boolean'
  && isTargetState(value.status)

export const isTargetResponse = (value: unknown): value is TargetResponse => {
  if (!isRecord(value)) return false
  if (value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'response') return false
  if (value.protocolVersion !== PROTOCOL_VERSION || typeof value.requestId !== 'string') return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string'
  if (value.ok !== true || !isTargetAction(value.action) || !isRecord(value.data)) return false
  if (value.action === 'LIST_TARGETS') {
    return Array.isArray(value.data.targets) && value.data.targets.every(isTargetDescriptor)
  }
  if (value.action === 'GET_TARGET_STATUS') {
    return isTargetDescriptor(value.data)
      && typeof (value.data as TargetStatusData).granted === 'boolean'
      && Array.isArray((value.data as TargetStatusData).capabilities)
      && (value.data as TargetStatusData).capabilities.every((item) => CAPABILITIES.includes(item as Capability))
  }
  if (value.action === 'CHECK_LOGIN') {
    const data = value.data as TargetLoginData
    const validState = data.connectionState === undefined
      || ['NOT_INSTALLED', 'NO_COOKIE', 'COOKIE_FOUND', 'BACKGROUND_OK', 'BACKGROUND_FAILED', 'PAGE_CONTEXT_OK', 'PAGE_CONTEXT_FAILED', 'NEED_LOGIN'].includes(data.connectionState)
    const validMode = data.connectionMode === undefined || data.connectionMode === 'background' || data.connectionMode === 'page'
    return typeof data.targetId === 'string'
      && typeof data.loggedIn === 'boolean'
      && validState
      && validMode
      && (data.cookieFound === undefined || typeof data.cookieFound === 'boolean')
  }
  if (value.action === 'GET_PROFILE') {
    return Object.keys(value.data).length === 2
      && typeof value.data.targetId === 'string'
      && isRecord(value.data.profile)
      && typeof value.data.profile.userId === 'string'
      && value.data.profile.userId.length > 0
      && typeof value.data.profile.displayName === 'string'
      && value.data.profile.displayName.length > 0
      && Object.keys(value.data.profile).length === 2
  }
  return typeof value.data.targetId === 'string'
    && typeof value.data.granted === 'boolean'
    && isTargetState(value.data.status)
}

export const SELLERSPRITE_KEYWORD_REVERSE_ACTION = 'SELLERSPRITE_KEYWORD_REVERSE' as const

export const MARKET_SELECTION_ACTION = 'MARKET_SELECTION' as const
export const KEYWORD_PRODUCT_RESEARCH_ACTION = 'KEYWORD_PRODUCT_RESEARCH' as const
export const HTML_SESSION_ACTIONS = [MARKET_SELECTION_ACTION, KEYWORD_PRODUCT_RESEARCH_ACTION] as const
export type HtmlSessionAction = (typeof HTML_SESSION_ACTIONS)[number]

export type SellerSpriteHtmlSessionData = {
  targetId: string
  completed: boolean
}
export type SellerSpriteHtmlSessionRequest = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'request'
  protocolVersion: typeof PROTOCOL_VERSION
  action: HtmlSessionAction
  requestId: string
  payload: { targetId: string }
}
export type SellerSpriteHtmlSessionSuccess = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'response'
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  action: HtmlSessionAction
  ok: true
  data: SellerSpriteHtmlSessionData
}
export type SellerSpriteHtmlSessionResponse = SellerSpriteHtmlSessionSuccess | ProtocolError

export const createSellerSpriteHtmlSessionRequest = (
  action: HtmlSessionAction,
  requestId: string,
  targetId: string,
): SellerSpriteHtmlSessionRequest => ({
  namespace: MESSAGE_NAMESPACE,
  kind: 'request',
  protocolVersion: PROTOCOL_VERSION,
  action,
  requestId,
  payload: { targetId },
})

export const isSellerSpriteHtmlSessionRequest = (
  value: unknown,
): value is SellerSpriteHtmlSessionRequest => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'request') return false
  return value.protocolVersion === PROTOCOL_VERSION
    && HTML_SESSION_ACTIONS.includes(value.action as HtmlSessionAction)
    && isBoundedString(value.requestId, 256)
    && isRecord(value.payload)
    && Object.keys(value.payload).length === 1
    && isBoundedString(value.payload.targetId, 64)
}

export const isSellerSpriteHtmlSessionResponse = (
  value: unknown,
): value is SellerSpriteHtmlSessionResponse => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'response') return false
  if (value.protocolVersion !== PROTOCOL_VERSION || !isBoundedString(value.requestId, 256)) return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string'
  return value.ok === true
    && HTML_SESSION_ACTIONS.includes(value.action as HtmlSessionAction)
    && isRecord(value.data)
    && Object.keys(value.data).length === 2
    && isBoundedString(value.data.targetId, 64)
    && typeof value.data.completed === 'boolean'
}


export type JsonPrimitive = string | number | boolean | null

export type SellerSpriteKeywordReverseInput = {
  asin: string
  marketId: number
  month: string
  forceReStat: boolean
  badges: JsonPrimitive[]
  limit: number
}

export type SellerSpriteKeywordTrend = {
  month: string
  searchRank: number | null
  searches: number | null
}

export type SellerSpriteKeywordItem = {
  keywords: string
  searches: number | null
  products: number | null
  supplyDemandRatio: number | null
  trafficPercentage: number | null
  purchaseRate: number | null
  bid: number | null
  bidMin: number | null
  bidMax: number | null
  avgPrice: number | null
  avgRating: number | null
  avgReviews: number | null
  searchesTrend: SellerSpriteKeywordTrend[] | null
}

export type SellerSpriteKeywordReverseData = {
  asin: string
  total: number
  items: SellerSpriteKeywordItem[]
}

export type SellerSpriteKeywordReverseRequest = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'request'
  protocolVersion: typeof PROTOCOL_VERSION
  action: typeof SELLERSPRITE_KEYWORD_REVERSE_ACTION
  requestId: string
  payload: { targetId: string; input: SellerSpriteKeywordReverseInput }
}

export type SellerSpriteKeywordReverseSuccess = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'response'
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  action: typeof SELLERSPRITE_KEYWORD_REVERSE_ACTION
  ok: true
  data: SellerSpriteKeywordReverseData
}

export type SellerSpriteKeywordReverseResponse = SellerSpriteKeywordReverseSuccess | ProtocolError

const KEYWORD_REVERSE_INPUT_KEYS = [
  'asin', 'marketId', 'month', 'forceReStat', 'badges', 'limit',
] as const

const isBoundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

const isBoundedOptionalString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max

const isJsonPrimitive = (value: unknown): value is JsonPrimitive =>
  value === null
  || typeof value === 'string'
  || typeof value === 'boolean'
  || (typeof value === 'number' && Number.isFinite(value))

const isJsonPrimitiveArray = (value: unknown): value is JsonPrimitive[] =>
  Array.isArray(value)
  && value.length <= 100
  && value.every(isJsonPrimitive)

export const isSellerSpriteKeywordReverseInput = (
  value: unknown,
): value is SellerSpriteKeywordReverseInput => {
  if (!isRecord(value) || Object.keys(value).length !== KEYWORD_REVERSE_INPUT_KEYS.length) return false
  if (!KEYWORD_REVERSE_INPUT_KEYS.every((key) => Object.hasOwn(value, key))) return false
  return isBoundedString(value.asin, 64)
    && typeof value.marketId === 'number'
    && Number.isInteger(value.marketId)
    && value.marketId > 0
    && value.marketId <= 1_000
    && isBoundedOptionalString(value.month, 32)
    && typeof value.forceReStat === 'boolean'
    && isJsonPrimitiveArray(value.badges)
    && typeof value.limit === 'number'
    && Number.isInteger(value.limit)
    && value.limit > 0
    && value.limit <= 100
}

export const createSellerSpriteKeywordReverseRequest = (
  requestId: string,
  targetId: string,
  input: SellerSpriteKeywordReverseInput,
): SellerSpriteKeywordReverseRequest => ({
  namespace: MESSAGE_NAMESPACE,
  kind: 'request',
  protocolVersion: PROTOCOL_VERSION,
  action: SELLERSPRITE_KEYWORD_REVERSE_ACTION,
  requestId,
  payload: { targetId, input },
})

export const isSellerSpriteKeywordReverseRequest = (
  value: unknown,
): value is SellerSpriteKeywordReverseRequest => {
  if (!isRecord(value)) return false
  if (value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'request') return false
  if (value.protocolVersion !== PROTOCOL_VERSION
    || value.action !== SELLERSPRITE_KEYWORD_REVERSE_ACTION
    || !isBoundedString(value.requestId, 256)
    || !isRecord(value.payload)
    || Object.keys(value.payload).length !== 2
    || !isBoundedString(value.payload.targetId, 64)) return false
  return isSellerSpriteKeywordReverseInput(value.payload.input)
}

const isNullableFiniteNumber = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value))

const isKeywordTrend = (value: unknown): value is SellerSpriteKeywordTrend =>
  isRecord(value)
  && Object.keys(value).length === 3
  && typeof value.month === 'string'
  && isNullableFiniteNumber(value.searchRank)
  && isNullableFiniteNumber(value.searches)

const isKeywordItem = (value: unknown): value is SellerSpriteKeywordItem =>
  isRecord(value)
  && Object.keys(value).length === 13
  && typeof value.keywords === 'string'
  && isNullableFiniteNumber(value.searches)
  && isNullableFiniteNumber(value.products)
  && isNullableFiniteNumber(value.supplyDemandRatio)
  && isNullableFiniteNumber(value.trafficPercentage)
  && isNullableFiniteNumber(value.purchaseRate)
  && isNullableFiniteNumber(value.bid)
  && isNullableFiniteNumber(value.bidMin)
  && isNullableFiniteNumber(value.bidMax)
  && isNullableFiniteNumber(value.avgPrice)
  && isNullableFiniteNumber(value.avgRating)
  && isNullableFiniteNumber(value.avgReviews)
  && (value.searchesTrend === null
    || (Array.isArray(value.searchesTrend) && value.searchesTrend.every(isKeywordTrend)))

export const isSellerSpriteKeywordReverseResponse = (
  value: unknown,
): value is SellerSpriteKeywordReverseResponse => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'response') return false
  if (value.protocolVersion !== PROTOCOL_VERSION || typeof value.requestId !== 'string') return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string'
  return value.ok === true
    && value.action === SELLERSPRITE_KEYWORD_REVERSE_ACTION
    && isRecord(value.data)
    && Object.keys(value.data).length === 3
    && typeof value.data.asin === 'string'
    && typeof value.data.total === 'number'
    && Number.isFinite(value.data.total)
    && value.data.total >= 0
    && Array.isArray(value.data.items)
    && value.data.items.every(isKeywordItem)
}

export const COMPETITOR_RESEARCH_ACTION = 'COMPETITOR_RESEARCH' as const

export type SellerSpriteCompetitorInput = {
  asins: string[]
  keywords: string
  brand: string
  seller: string
  lowPrice: 'Y' | 'N'
  market: string
  monthName: string
  nodeIdPaths: JsonPrimitive[]
  order: { desc: boolean; field: string }
  page: number
  size: number
  symbolFlag: boolean
}

export type SellerSpriteCompetitorItem = {
  asin: string
  title: string | null
  brand: string | null
  imageUrl: string | null
  price: number | null
  rating: number | null
  reviews: number | null
  estimatedSales: number | null
  availableDate: number | null
  availableDays: number | null
}

export type SellerSpriteCompetitorData = {
  page: number
  pages: number
  size: number
  total: number
  hasNextPage: boolean
  items: SellerSpriteCompetitorItem[]
}

export type SellerSpriteCompetitorRequest = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'request'
  protocolVersion: typeof PROTOCOL_VERSION
  action: typeof COMPETITOR_RESEARCH_ACTION
  requestId: string
  payload: { targetId: string; input: SellerSpriteCompetitorInput }
}

export type SellerSpriteCompetitorSuccess = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'response'
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  action: typeof COMPETITOR_RESEARCH_ACTION
  ok: true
  data: SellerSpriteCompetitorData
}

export type SellerSpriteCompetitorResponse = SellerSpriteCompetitorSuccess | ProtocolError

const COMPETITOR_INPUT_KEYS = [
  'asins', 'keywords', 'brand', 'seller', 'lowPrice', 'market', 'monthName', 'nodeIdPaths',
  'order', 'page', 'size', 'symbolFlag',
] as const

const isPrimitiveArray = (value: unknown): value is JsonPrimitive[] =>
  Array.isArray(value) && value.length <= 100 && value.every(isJsonPrimitive)

export const isSellerSpriteCompetitorInput = (
  value: unknown,
): value is SellerSpriteCompetitorInput => {
  if (!isRecord(value) || Object.keys(value).length !== COMPETITOR_INPUT_KEYS.length) return false
  if (!COMPETITOR_INPUT_KEYS.every((key) => Object.hasOwn(value, key))) return false
  const selectors = [
    Array.isArray(value.asins) && value.asins.length > 0,
    typeof value.keywords === 'string' && value.keywords.length > 0,
    typeof value.brand === 'string' && value.brand.length > 0,
    typeof value.seller === 'string' && value.seller.length > 0,
  ]
  return Array.isArray(value.asins)
    && value.asins.length <= 100
    && value.asins.every((asin) => isBoundedString(asin, 16))
    && isBoundedOptionalString(value.keywords, 80)
    && isBoundedOptionalString(value.brand, 128)
    && isBoundedOptionalString(value.seller, 128)
    && selectors.filter(Boolean).length === 1
    && (value.lowPrice === 'Y' || value.lowPrice === 'N')
    && isBoundedString(value.market, 32)
    && isBoundedString(value.monthName, 32)
    && isPrimitiveArray(value.nodeIdPaths)
    && isRecord(value.order)
    && Object.keys(value.order).length === 2
    && typeof value.order.desc === 'boolean'
    && isBoundedString(value.order.field, 64)
    && typeof value.page === 'number'
    && Number.isInteger(value.page) && value.page > 0 && value.page <= 10_000
    && typeof value.size === 'number'
    && Number.isInteger(value.size) && value.size > 0 && value.size <= 60
    && typeof value.symbolFlag === 'boolean'
}

export const createSellerSpriteCompetitorRequest = (
  requestId: string,
  targetId: string,
  input: SellerSpriteCompetitorInput,
): SellerSpriteCompetitorRequest => ({
  namespace: MESSAGE_NAMESPACE,
  kind: 'request',
  protocolVersion: PROTOCOL_VERSION,
  action: COMPETITOR_RESEARCH_ACTION,
  requestId,
  payload: { targetId, input },
})

export const isSellerSpriteCompetitorRequest = (
  value: unknown,
): value is SellerSpriteCompetitorRequest => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'request') return false
  if (value.protocolVersion !== PROTOCOL_VERSION
    || value.action !== COMPETITOR_RESEARCH_ACTION
    || !isBoundedString(value.requestId, 256)
    || !isRecord(value.payload)
    || Object.keys(value.payload).length !== 2
    || !isBoundedString(value.payload.targetId, 64)) return false
  return isSellerSpriteCompetitorInput(value.payload.input)
}

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

const isCompetitorItem = (value: unknown): value is SellerSpriteCompetitorItem =>
  isRecord(value)
  && Object.keys(value).length === 10
  && typeof value.asin === 'string'
  && isNullableString(value.title)
  && isNullableString(value.brand)
  && isNullableString(value.imageUrl)
  && isNullableFiniteNumber(value.price)
  && isNullableFiniteNumber(value.rating)
  && isNullableFiniteNumber(value.reviews)
  && isNullableFiniteNumber(value.estimatedSales)
  && isNullableFiniteNumber(value.availableDate)
  && isNullableFiniteNumber(value.availableDays)

export const isSellerSpriteCompetitorResponse = (
  value: unknown,
): value is SellerSpriteCompetitorResponse => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'response') return false
  if (value.protocolVersion !== PROTOCOL_VERSION || typeof value.requestId !== 'string') return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string'
  if (value.ok !== true || value.action !== COMPETITOR_RESEARCH_ACTION || !isRecord(value.data)) return false
  const data = value.data
  return Object.keys(data).length === 6
    && typeof data.page === 'number'
    && typeof data.pages === 'number'
    && typeof data.size === 'number'
    && typeof data.total === 'number'
    && typeof data.hasNextPage === 'boolean'
    && Array.isArray(data.items)
    && data.items.every(isCompetitorItem)
}

export const PRODUCT_SELECTION_ACTION = 'PRODUCT_SELECTION' as const

export type SellerSpriteProductSelectionInput = {
  eligibility: JsonPrimitive[]
  filterSub: boolean
  lowPrice: 'Y' | 'N'
  market: string
  monthName: string
  nodeIdPaths: JsonPrimitive[]
  order: { desc: boolean; field: string }
  page: number
  pkgDimensionTypeList: JsonPrimitive[]
  productTags: JsonPrimitive[]
  salesGrowthType: '30d'
  selectType: 2
  sellerNationList: JsonPrimitive[]
  sellerTypes: JsonPrimitive[]
  size: number
  symbolFlag: boolean
  video: '' | 'Y'
  weightUnit: 'g'
}

export type SellerSpriteProductSelectionItem = {
  asin: string
  title: string | null
  brand: string | null
  imageUrl: string | null
  price: number | null
  rating: number | null
  reviews: number | null
  estimatedSales: number | null
  availableDate: number | null
  availableDays: number | null
}

export type SellerSpriteProductSelectionData = {
  page: number
  pages: number
  size: number
  total: number
  hasNextPage: boolean
  items: SellerSpriteProductSelectionItem[]
}
export type SellerSpriteProductSelectionRequest = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'request'
  protocolVersion: typeof PROTOCOL_VERSION
  action: typeof PRODUCT_SELECTION_ACTION
  requestId: string
  payload: { targetId: string; input: SellerSpriteProductSelectionInput }
}
export type SellerSpriteProductSelectionSuccess = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'response'
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  action: typeof PRODUCT_SELECTION_ACTION
  ok: true
  data: SellerSpriteProductSelectionData
}
export type SellerSpriteProductSelectionResponse = SellerSpriteProductSelectionSuccess | ProtocolError

const PRODUCT_SELECTION_INPUT_KEYS = [
  'eligibility', 'filterSub', 'lowPrice', 'market', 'monthName', 'nodeIdPaths', 'order', 'page',
  'pkgDimensionTypeList', 'productTags', 'salesGrowthType', 'selectType', 'sellerNationList',
  'sellerTypes', 'size', 'symbolFlag', 'video', 'weightUnit',
] as const

const isStrictPrimitiveArray = (value: unknown): value is JsonPrimitive[] =>
  Array.isArray(value) && value.length <= 100 && value.every(isJsonPrimitive)

export const isSellerSpriteProductSelectionInput = (
  value: unknown,
): value is SellerSpriteProductSelectionInput => {
  if (!isRecord(value) || Object.keys(value).length !== PRODUCT_SELECTION_INPUT_KEYS.length) return false
  if (!PRODUCT_SELECTION_INPUT_KEYS.every((key) => Object.hasOwn(value, key))) return false
  return isStrictPrimitiveArray(value.eligibility)
    && typeof value.filterSub === 'boolean'
    && (value.lowPrice === 'Y' || value.lowPrice === 'N')
    && isBoundedString(value.market, 32)
    && isBoundedString(value.monthName, 32)
    && isStrictPrimitiveArray(value.nodeIdPaths)
    && isRecord(value.order)
    && Object.keys(value.order).length === 2
    && typeof value.order.desc === 'boolean'
    && isBoundedString(value.order.field, 64)
    && typeof value.page === 'number'
    && Number.isInteger(value.page) && value.page > 0 && value.page <= 10_000
    && isStrictPrimitiveArray(value.pkgDimensionTypeList)
    && isStrictPrimitiveArray(value.productTags)
    && value.salesGrowthType === '30d'
    && value.selectType === 2
    && isStrictPrimitiveArray(value.sellerNationList)
    && isStrictPrimitiveArray(value.sellerTypes)
    && typeof value.size === 'number'
    && Number.isInteger(value.size) && value.size > 0 && value.size <= 100
    && typeof value.symbolFlag === 'boolean'
    && (value.video === '' || value.video === 'Y')
    && value.weightUnit === 'g'
}

export const createSellerSpriteProductSelectionRequest = (
  requestId: string,
  targetId: string,
  input: SellerSpriteProductSelectionInput,
): SellerSpriteProductSelectionRequest => ({
  namespace: MESSAGE_NAMESPACE,
  kind: 'request',
  protocolVersion: PROTOCOL_VERSION,
  action: PRODUCT_SELECTION_ACTION,
  requestId,
  payload: { targetId, input },
})

export const isSellerSpriteProductSelectionRequest = (
  value: unknown,
): value is SellerSpriteProductSelectionRequest => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'request') return false
  if (value.protocolVersion !== PROTOCOL_VERSION
    || value.action !== PRODUCT_SELECTION_ACTION
    || !isBoundedString(value.requestId, 256)
    || !isRecord(value.payload)
    || Object.keys(value.payload).length !== 2
    || !isBoundedString(value.payload.targetId, 64)) return false
  return isSellerSpriteProductSelectionInput(value.payload.input)
}

const isProductSelectionItem = (value: unknown): value is SellerSpriteProductSelectionItem =>
  isRecord(value)
  && Object.keys(value).length === 10
  && typeof value.asin === 'string'
  && isNullableString(value.title)
  && isNullableString(value.brand)
  && isNullableString(value.imageUrl)
  && isNullableFiniteNumber(value.price)
  && isNullableFiniteNumber(value.rating)
  && isNullableFiniteNumber(value.reviews)
  && isNullableFiniteNumber(value.estimatedSales)
  && isNullableFiniteNumber(value.availableDate)
  && isNullableFiniteNumber(value.availableDays)

export const isSellerSpriteProductSelectionResponse = (
  value: unknown,
): value is SellerSpriteProductSelectionResponse => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'response') return false
  if (value.protocolVersion !== PROTOCOL_VERSION || typeof value.requestId !== 'string') return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string'
  if (value.ok !== true || value.action !== PRODUCT_SELECTION_ACTION || !isRecord(value.data)) return false
  const data = value.data
  return Object.keys(data).length === 6
    && typeof data.page === 'number'
    && typeof data.pages === 'number'
    && typeof data.size === 'number'
    && typeof data.total === 'number'
    && typeof data.hasNextPage === 'boolean'
    && Array.isArray(data.items)
    && data.items.every(isProductSelectionItem)
}

export const KEYWORD_MINING_ACTION = 'KEYWORD_MINING' as const

export type SellerSpriteKeywordMiningInput = {
  amazonChoice: boolean
  desc: boolean
  filterRootWord: number
  historyDate: string
  keyword: string
  keywordBidMatchType: string
  market: number
  matchType: number
  orderBy: number
  pageNum: number
  pageSize: number
}

export type SellerSpriteKeywordMiningDepartment = {
  code: string
  label: string
}

export type SellerSpriteKeywordMiningTrend = {
  month: string
  search: number | null
  searchRank: number | null
}

export type SellerSpriteKeywordMiningItem = {
  keyword: string
  keywordCn: string | null
  keywordJp: string | null
  market: string | null
  marketId: number | null
  website: string | null
  departments: SellerSpriteKeywordMiningDepartment[]
  trends: SellerSpriteKeywordMiningTrend[]
  month: string | null
  searches: number | null
  purchases: number | null
  purchaseRate: number | null
  products: number | null
  adProducts: number | null
  supplyDemandRatio: number | null
  avgPrice: number | null
  avgReviews: number | null
  avgRating: number | null
  bid: number | null
  phrasePpc: number | null
  broadPpc: number | null
  exactPpc: number | null
  cvsShareRate: number | null
  wordCount: number | null
  titleDensity: number | null
  spr: number | null
  relevancy: number | null
  absoluteRelevancy: number | null
  amazonChoice: boolean | null
  searchRank: number | null
  searchWeeklyRank: number | null
  clicks: number | null
  impressions: number | null
}

export type SellerSpriteKeywordMiningData = {
  items: SellerSpriteKeywordMiningItem[]
  page: number
  size: number
  took: number
  total: number
}

const KEYWORD_MINING_ITEM_KEYS = [
  'keyword', 'keywordCn', 'keywordJp', 'market', 'marketId', 'website', 'departments', 'trends', 'month',
  'searches', 'purchases', 'purchaseRate', 'products', 'adProducts', 'supplyDemandRatio', 'avgPrice',
  'avgReviews', 'avgRating', 'bid', 'phrasePpc', 'broadPpc', 'exactPpc', 'cvsShareRate', 'wordCount',
  'titleDensity', 'spr', 'relevancy', 'absoluteRelevancy', 'amazonChoice', 'searchRank', 'searchWeeklyRank',
  'clicks', 'impressions',
] as const

const isKeywordMiningDepartment = (value: unknown): value is SellerSpriteKeywordMiningDepartment =>
  isRecord(value)
  && Object.keys(value).length === 2
  && typeof value.code === 'string'
  && typeof value.label === 'string'

const isKeywordMiningTrend = (value: unknown): value is SellerSpriteKeywordMiningTrend =>
  isRecord(value)
  && Object.keys(value).length === 3
  && typeof value.month === 'string'
  && isNullableFiniteNumber(value.search)
  && isNullableFiniteNumber(value.searchRank)

const isKeywordMiningItem = (value: unknown): value is SellerSpriteKeywordMiningItem => {
  if (!isRecord(value) || Object.keys(value).length !== KEYWORD_MINING_ITEM_KEYS.length
    || !KEYWORD_MINING_ITEM_KEYS.every((key) => Object.hasOwn(value, key))) return false
  const nullableStrings = ['keywordCn', 'keywordJp', 'market', 'website', 'month'] as const
  const nullableNumbers = [
    'marketId', 'searches', 'purchases', 'purchaseRate', 'products', 'adProducts', 'supplyDemandRatio',
    'avgPrice', 'avgReviews', 'avgRating', 'bid', 'phrasePpc', 'broadPpc', 'exactPpc', 'cvsShareRate',
    'wordCount', 'titleDensity', 'spr', 'relevancy', 'absoluteRelevancy', 'searchRank', 'searchWeeklyRank',
    'clicks', 'impressions',
  ] as const
  return typeof value.keyword === 'string'
    && nullableStrings.every((key) => isNullableString(value[key]))
    && nullableNumbers.every((key) => isNullableFiniteNumber(value[key]))
    && (typeof value.amazonChoice === 'boolean' || value.amazonChoice === null)
    && Array.isArray(value.departments)
    && value.departments.every(isKeywordMiningDepartment)
    && Array.isArray(value.trends)
    && value.trends.every(isKeywordMiningTrend)
}
export type SellerSpriteKeywordMiningRequest = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'request'
  protocolVersion: typeof PROTOCOL_VERSION
  action: typeof KEYWORD_MINING_ACTION
  requestId: string
  payload: { targetId: string; input: SellerSpriteKeywordMiningInput }
}
export type SellerSpriteKeywordMiningSuccess = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'response'
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  action: typeof KEYWORD_MINING_ACTION
  ok: true
  data: SellerSpriteKeywordMiningData
}
export type SellerSpriteKeywordMiningResponse = SellerSpriteKeywordMiningSuccess | ProtocolError

const KEYWORD_MINING_INPUT_KEYS = [
  'amazonChoice', 'desc', 'filterRootWord', 'historyDate', 'keyword', 'keywordBidMatchType',
  'market', 'matchType', 'orderBy', 'pageNum', 'pageSize',
] as const

export const isSellerSpriteKeywordMiningInput = (
  value: unknown,
): value is SellerSpriteKeywordMiningInput => {
  if (!isRecord(value) || Object.keys(value).length !== KEYWORD_MINING_INPUT_KEYS.length) return false
  if (!KEYWORD_MINING_INPUT_KEYS.every((key) => Object.hasOwn(value, key))) return false
  return typeof value.amazonChoice === 'boolean'
    && typeof value.desc === 'boolean'
    && typeof value.filterRootWord === 'number'
    && Number.isInteger(value.filterRootWord) && value.filterRootWord >= 0 && value.filterRootWord <= 1
    && isBoundedOptionalString(value.historyDate, 32)
    && isBoundedString(value.keyword, 256)
    && isBoundedString(value.keywordBidMatchType, 64)
    && typeof value.market === 'number'
    && Number.isInteger(value.market) && value.market > 0 && value.market <= 1000
    && typeof value.matchType === 'number'
    && Number.isInteger(value.matchType) && value.matchType >= 0 && value.matchType <= 100
    && typeof value.orderBy === 'number'
    && Number.isInteger(value.orderBy) && value.orderBy >= 0 && value.orderBy <= 1000
    && typeof value.pageNum === 'number'
    && Number.isInteger(value.pageNum) && value.pageNum > 0 && value.pageNum <= 10_000
    && typeof value.pageSize === 'number'
    && Number.isInteger(value.pageSize) && value.pageSize > 0 && value.pageSize <= 100
}

export const createSellerSpriteKeywordMiningRequest = (
  requestId: string,
  targetId: string,
  input: SellerSpriteKeywordMiningInput,
): SellerSpriteKeywordMiningRequest => ({
  namespace: MESSAGE_NAMESPACE,
  kind: 'request',
  protocolVersion: PROTOCOL_VERSION,
  action: KEYWORD_MINING_ACTION,
  requestId,
  payload: { targetId, input },
})

export const isSellerSpriteKeywordMiningRequest = (
  value: unknown,
): value is SellerSpriteKeywordMiningRequest => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'request') return false
  if (value.protocolVersion !== PROTOCOL_VERSION
    || value.action !== KEYWORD_MINING_ACTION
    || !isBoundedString(value.requestId, 256)
    || !isRecord(value.payload)
    || Object.keys(value.payload).length !== 2
    || !isBoundedString(value.payload.targetId, 64)) return false
  return isSellerSpriteKeywordMiningInput(value.payload.input)
}

export const isSellerSpriteKeywordMiningResponse = (
  value: unknown,
): value is SellerSpriteKeywordMiningResponse => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'response') return false
  if (value.protocolVersion !== PROTOCOL_VERSION || typeof value.requestId !== 'string') return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string'
  if (value.ok !== true || value.action !== KEYWORD_MINING_ACTION || !isRecord(value.data)) return false
  return Object.keys(value.data).length === 5
    && Array.isArray(value.data.items)
    && value.data.items.every(isKeywordMiningItem)
    && Number.isFinite(value.data.page)
    && Number.isFinite(value.data.size)
    && Number.isFinite(value.data.took)
    && Number.isFinite(value.data.total)
}

export const SELLERSPRITE_MONTHLY_ACTION = 'SELLERSPRITE_MONTHLY' as const

export type SellerSpriteMonthlyInput = {
  asin: string
  month: string
  station: string
}

export type SellerSpriteMonthlyVariation = {
  asin: string
  availableDate: number | null
  availableDays: number | null
  bsrLabel: string | null
  bsrRank: number | null
  currency: string | null
  price: number | null
  rating: number | null
  reviews: number | null
  reviewsRate: number | null
  station: string | null
  title: string | null
}

export type SellerSpriteMonthlyData = {
  variations: SellerSpriteMonthlyVariation[]
  historyStatus: 'not-verified'
}

export type SellerSpriteMonthlyRequest = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'request'
  protocolVersion: typeof PROTOCOL_VERSION
  action: typeof SELLERSPRITE_MONTHLY_ACTION
  requestId: string
  payload: { targetId: string; input: SellerSpriteMonthlyInput }
}

export type SellerSpriteMonthlySuccess = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'response'
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  action: typeof SELLERSPRITE_MONTHLY_ACTION
  ok: true
  data: SellerSpriteMonthlyData
}

export type SellerSpriteMonthlyResponse = SellerSpriteMonthlySuccess | ProtocolError

const MONTHLY_INPUT_KEYS = ['asin', 'month', 'station'] as const
const MONTHLY_VARIATION_KEYS = [
  'asin', 'availableDate', 'availableDays', 'bsrLabel', 'bsrRank', 'currency', 'price',
  'rating', 'reviews', 'reviewsRate', 'station', 'title',
] as const

const isNullableBoundedString = (value: unknown, max: number): value is string | null =>
  value === null || (typeof value === 'string' && value.length <= max)

const isMonthlyVariation = (value: unknown): value is SellerSpriteMonthlyVariation => {
  if (!isRecord(value) || Object.keys(value).length !== MONTHLY_VARIATION_KEYS.length
    || !MONTHLY_VARIATION_KEYS.every((key) => Object.hasOwn(value, key))) return false
  return isBoundedString(value.asin, 32)
    && isNullableFiniteNumber(value.availableDate)
    && isNullableFiniteNumber(value.availableDays)
    && isNullableBoundedString(value.bsrLabel, 256)
    && isNullableFiniteNumber(value.bsrRank)
    && isNullableBoundedString(value.currency, 16)
    && isNullableFiniteNumber(value.price)
    && isNullableFiniteNumber(value.rating)
    && isNullableFiniteNumber(value.reviews)
    && isNullableFiniteNumber(value.reviewsRate)
    && isNullableBoundedString(value.station, 32)
    && isNullableBoundedString(value.title, 512)
}

export const isSellerSpriteMonthlyInput = (value: unknown): value is SellerSpriteMonthlyInput =>
  isRecord(value)
  && Object.keys(value).length === MONTHLY_INPUT_KEYS.length
  && MONTHLY_INPUT_KEYS.every((key) => Object.hasOwn(value, key))
  && isBoundedString(value.asin, 32)
  && isBoundedOptionalString(value.month, 32)
  && isBoundedString(value.station, 32)

export const createSellerSpriteMonthlyRequest = (
  requestId: string,
  targetId: string,
  input: SellerSpriteMonthlyInput,
): SellerSpriteMonthlyRequest => ({
  namespace: MESSAGE_NAMESPACE,
  kind: 'request',
  protocolVersion: PROTOCOL_VERSION,
  action: SELLERSPRITE_MONTHLY_ACTION,
  requestId,
  payload: { targetId, input },
})

export const isSellerSpriteMonthlyRequest = (value: unknown): value is SellerSpriteMonthlyRequest => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'request') return false
  return value.protocolVersion === PROTOCOL_VERSION
    && value.action === SELLERSPRITE_MONTHLY_ACTION
    && isBoundedString(value.requestId, 256)
    && isRecord(value.payload)
    && Object.keys(value.payload).length === 2
    && isBoundedString(value.payload.targetId, 64)
    && isSellerSpriteMonthlyInput(value.payload.input)
}


export const isSellerSpriteMonthlyResponse = (value: unknown): value is SellerSpriteMonthlyResponse => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'response') return false
  if (value.protocolVersion !== PROTOCOL_VERSION || !isBoundedString(value.requestId, 256)) return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string'
  return value.ok === true
    && value.action === SELLERSPRITE_MONTHLY_ACTION
    && isRecord(value.data)
    && Object.keys(value.data).length === 2
    && Array.isArray(value.data.variations)
    && value.data.variations.every(isMonthlyVariation)
    && value.data.historyStatus === 'not-verified'
}

export const SELLERSPRITE_MARKET_RESEARCH_ACTION = 'SELLERSPRITE_MARKET_RESEARCH' as const
export const SELLERSPRITE_MARKET_RECENT_30_DAYS = 'bsr_sales_nearly' as const
export const SELLERSPRITE_NEW_RELEASE_MONTHS = [1, 3, 6, 12] as const
export type SellerSpriteMarketResearchMonth =
  | typeof SELLERSPRITE_MARKET_RECENT_30_DAYS
  | `bsr_sales_monthly_${number}`
export type SellerSpriteNewReleaseMonths = (typeof SELLERSPRITE_NEW_RELEASE_MONTHS)[number]

const marketResearchMonthlyValue = (date: Date, monthsAgo: number): SellerSpriteMarketResearchMonth => {
  const month = new Date(date.getFullYear(), date.getMonth() - monthsAgo, 1)
  return `bsr_sales_monthly_${month.getFullYear()}${String(month.getMonth() + 1).padStart(2, '0')}` as SellerSpriteMarketResearchMonth
}

export const getSellerSpriteMarketResearchMonths = (
  date = new Date(),
): readonly SellerSpriteMarketResearchMonth[] => [
  SELLERSPRITE_MARKET_RECENT_30_DAYS,
  ...Array.from({ length: 13 }, (_, index) => marketResearchMonthlyValue(date, index + 1)),
]

export const isSellerSpriteMarketResearchMonth = (
  value: unknown,
  date = new Date(),
): value is SellerSpriteMarketResearchMonth =>
  typeof value === 'string' && getSellerSpriteMarketResearchMonths(date).includes(value as SellerSpriteMarketResearchMonth)

export const isSellerSpriteNewReleaseMonths = (value: unknown): value is SellerSpriteNewReleaseMonths =>
  SELLERSPRITE_NEW_RELEASE_MONTHS.includes(value as SellerSpriteNewReleaseMonths)

export type SellerSpriteMarketResearchInput = {
  marketId: 1
  departmentKeyword: string
  monthName: SellerSpriteMarketResearchMonth
  newReleaseNum: SellerSpriteNewReleaseMonths
}

export type SellerSpriteMarketResearchRow = {
  marketName: string
  sampleProducts: number | null
  sampleBrands: number | null
  sampleSellers: number | null
  totalSales: number | null
  averageSales: number | null
  headSales: number | null
  averageRevenue: number | null
  headRevenue: number | null
  averageReviews: number | null
  averageRating: number | null
  averageBsr: number | null
  headBsr: number | null
  averageSellers: number | null
  averagePrice: number | null
  fbaRatio: number | null
  amzRatio: number | null
  fbmRatio: number | null
  productConcentration: number | null
  brandConcentration: number | null
  sellerConcentration: number | null
  newProductCount: number | null
  newProductRatio: number | null
  totalProducts: number | null
  profit: null
}

export type SellerSpriteMarketResearchCoverage = {
  sampleCounts: number
  totalSales: number
  averageSales: number
  averageRevenue: number
  rating: number
  bsr: number
  price: number
  sellerTypes: number
  concentration: number
  newProducts: number
  totalProducts: number
  profit: 0
}

export type SellerSpriteMarketResearchData = {
  rows: SellerSpriteMarketResearchRow[]
  fieldCoverage: SellerSpriteMarketResearchCoverage
  profitStatus: 'not-integrated'
}

export type SellerSpriteMarketResearchRequest = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'request'
  protocolVersion: typeof PROTOCOL_VERSION
  action: typeof SELLERSPRITE_MARKET_RESEARCH_ACTION
  requestId: string
  payload: { targetId: string; input: SellerSpriteMarketResearchInput }
}

export type SellerSpriteMarketResearchSuccess = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'response'
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  action: typeof SELLERSPRITE_MARKET_RESEARCH_ACTION
  ok: true
  data: SellerSpriteMarketResearchData
}

export type SellerSpriteMarketResearchResponse = SellerSpriteMarketResearchSuccess | ProtocolError

const MARKET_RESEARCH_ROW_KEYS = [
  'marketName', 'sampleProducts', 'sampleBrands', 'sampleSellers', 'totalSales', 'averageSales',
  'headSales', 'averageRevenue', 'headRevenue', 'averageReviews', 'averageRating', 'averageBsr',
  'headBsr', 'averageSellers', 'averagePrice', 'fbaRatio', 'amzRatio', 'fbmRatio',
  'productConcentration', 'brandConcentration', 'sellerConcentration', 'newProductCount',
  'newProductRatio', 'totalProducts', 'profit',
] as const
const MARKET_RESEARCH_COVERAGE_KEYS = [
  'sampleCounts', 'totalSales', 'averageSales', 'averageRevenue', 'rating', 'bsr', 'price',
  'sellerTypes', 'concentration', 'newProducts', 'totalProducts', 'profit',
] as const

export const isSellerSpriteMarketResearchInput = (value: unknown): value is SellerSpriteMarketResearchInput =>
  isRecord(value)
  && Object.keys(value).length === 4
  && value.marketId === 1
  && isBoundedString(value.departmentKeyword, 80)
  && /^[A-Za-z0-9][A-Za-z0-9 &'/-]*$/.test(value.departmentKeyword)
  && isSellerSpriteMarketResearchMonth(value.monthName)
  && isSellerSpriteNewReleaseMonths(value.newReleaseNum)

export const createSellerSpriteMarketResearchRequest = (
  requestId: string,
  targetId: string,
  input: SellerSpriteMarketResearchInput,
): SellerSpriteMarketResearchRequest => ({
  namespace: MESSAGE_NAMESPACE,
  kind: 'request',
  protocolVersion: PROTOCOL_VERSION,
  action: SELLERSPRITE_MARKET_RESEARCH_ACTION,
  requestId,
  payload: { targetId, input },
})

export const isSellerSpriteMarketResearchRequest = (value: unknown): value is SellerSpriteMarketResearchRequest =>
  isRecord(value)
  && value.namespace === MESSAGE_NAMESPACE
  && value.kind === 'request'
  && value.protocolVersion === PROTOCOL_VERSION
  && value.action === SELLERSPRITE_MARKET_RESEARCH_ACTION
  && isBoundedString(value.requestId, 256)
  && isRecord(value.payload)
  && Object.keys(value.payload).length === 2
  && isBoundedString(value.payload.targetId, 64)
  && isSellerSpriteMarketResearchInput(value.payload.input)

const isMarketResearchRow = (value: unknown): value is SellerSpriteMarketResearchRow =>
  isRecord(value)
  && Object.keys(value).length === MARKET_RESEARCH_ROW_KEYS.length
  && MARKET_RESEARCH_ROW_KEYS.every((key) => Object.hasOwn(value, key))
  && isBoundedString(value.marketName, 512)
  && MARKET_RESEARCH_ROW_KEYS.slice(1, -1).every((key) => isNullableFiniteNumber(value[key]))
  && value.profit === null

const isMarketResearchCoverage = (value: unknown): value is SellerSpriteMarketResearchCoverage =>
  isRecord(value)
  && Object.keys(value).length === MARKET_RESEARCH_COVERAGE_KEYS.length
  && MARKET_RESEARCH_COVERAGE_KEYS.every((key) => Object.hasOwn(value, key))
  && MARKET_RESEARCH_COVERAGE_KEYS.every((key) => typeof value[key] === 'number'
    && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1)
  && value.profit === 0

export const isSellerSpriteMarketResearchResponse = (value: unknown): value is SellerSpriteMarketResearchResponse => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'response') return false
  if (value.protocolVersion !== PROTOCOL_VERSION || !isBoundedString(value.requestId, 256)) return false
  if (value.ok === false) return isRecord(value.error) && typeof value.error.code === 'string'
  return value.ok === true
    && value.action === SELLERSPRITE_MARKET_RESEARCH_ACTION
    && isRecord(value.data)
    && Object.keys(value.data).length === 3
    && Array.isArray(value.data.rows)
    && value.data.rows.length <= 100
    && value.data.rows.every(isMarketResearchRow)
    && isMarketResearchCoverage(value.data.fieldCoverage)
    && value.data.profitStatus === 'not-integrated'
}

export const SELLERSPRITE_ABA_PERIODS_ACTION = 'SELLERSPRITE_ABA_PERIODS' as const
export const SELLERSPRITE_ABA_RESEARCH_ACTION = 'SELLERSPRITE_ABA_RESEARCH' as const
export const SELLERSPRITE_ABA_MARKETS = ['COM', 'CA', 'GB', 'DE', 'FR', 'JP', 'IT', 'ES', 'IN', 'MX'] as const
export type SellerSpriteAbaMarket = (typeof SELLERSPRITE_ABA_MARKETS)[number]
export type SellerSpriteAbaReverseType = 'W' | 'M'

export type SellerSpriteAbaPeriod = {
  table: string
  label: string
}

export type SellerSpriteAbaPeriodsData = {
  weekTables: SellerSpriteAbaPeriod[]
  monthTables: SellerSpriteAbaPeriod[]
}

export type SellerSpriteAbaResearchInput = {
  reverseType: SellerSpriteAbaReverseType
  table: string
  q: string
  market: SellerSpriteAbaMarket
  page: number
  size: number
}

export type SellerSpriteAbaItem = {
  keyword: string
  keywordCn: string | null
  keywordJp: string | null
  searches: number | null
  clicks: number | null
  impressions: number | null
  purchaseRate: number | null
  purchases: number | null
  products: number | null
  departments: string[]
  searchRank: number | null
  searchRankGrowthValue: number | null
  searchRankGrowthRate: number | null
  cvsShareRate: number | null
  clickShareRate: number | null
}

export type SellerSpriteAbaResearchData = {
  page: number
  pages: number
  size: number
  total: number
  took: number | null
  hasNextPage: boolean
  items: SellerSpriteAbaItem[]
}

export type SellerSpriteAbaPeriodsRequest = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'request'
  protocolVersion: typeof PROTOCOL_VERSION
  action: typeof SELLERSPRITE_ABA_PERIODS_ACTION
  requestId: string
  payload: { targetId: string }
}
export type SellerSpriteAbaResearchRequest = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'request'
  protocolVersion: typeof PROTOCOL_VERSION
  action: typeof SELLERSPRITE_ABA_RESEARCH_ACTION
  requestId: string
  payload: { targetId: string; input: SellerSpriteAbaResearchInput }
}
export type SellerSpriteAbaPeriodsSuccess = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'response'
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  action: typeof SELLERSPRITE_ABA_PERIODS_ACTION
  ok: true
  data: SellerSpriteAbaPeriodsData
}
export type SellerSpriteAbaResearchSuccess = {
  namespace: typeof MESSAGE_NAMESPACE
  kind: 'response'
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  action: typeof SELLERSPRITE_ABA_RESEARCH_ACTION
  ok: true
  data: SellerSpriteAbaResearchData
}
export type SellerSpriteAbaPeriodsResponse = SellerSpriteAbaPeriodsSuccess | ProtocolError
export type SellerSpriteAbaResearchResponse = SellerSpriteAbaResearchSuccess | ProtocolError

const ABA_RESEARCH_INPUT_KEYS = ['reverseType', 'table', 'q', 'market', 'page', 'size'] as const
const ABA_ITEM_KEYS = [
  'keyword', 'keywordCn', 'keywordJp', 'searches', 'clicks', 'impressions', 'purchaseRate',
  'purchases', 'products', 'departments', 'searchRank', 'searchRankGrowthValue',
  'searchRankGrowthRate', 'cvsShareRate', 'clickShareRate',
] as const

export const isSellerSpriteAbaMarket = (value: unknown): value is SellerSpriteAbaMarket =>
  SELLERSPRITE_ABA_MARKETS.includes(value as SellerSpriteAbaMarket)

export const isSellerSpriteAbaResearchInput = (value: unknown): value is SellerSpriteAbaResearchInput => {
  if (!isRecord(value)
    || Object.keys(value).length !== ABA_RESEARCH_INPUT_KEYS.length
    || !ABA_RESEARCH_INPUT_KEYS.every((key) => Object.hasOwn(value, key))) return false
  const tablePattern = value.reverseType === 'W' ? /^ara_\d{8}$/ : value.reverseType === 'M' ? /^ara_\d{6}$/ : null
  return tablePattern !== null
    && typeof value.table === 'string'
    && tablePattern.test(value.table)
    && isBoundedString(value.q, 256)
    && isSellerSpriteAbaMarket(value.market)
    && Number.isInteger(value.page) && (value.page as number) >= 1 && (value.page as number) <= 10_000
    && Number.isInteger(value.size) && (value.size as number) >= 1 && (value.size as number) <= 50
}

export const createSellerSpriteAbaPeriodsRequest = (
  requestId: string,
  targetId: string,
): SellerSpriteAbaPeriodsRequest => ({
  namespace: MESSAGE_NAMESPACE,
  kind: 'request',
  protocolVersion: PROTOCOL_VERSION,
  action: SELLERSPRITE_ABA_PERIODS_ACTION,
  requestId,
  payload: { targetId },
})

export const createSellerSpriteAbaResearchRequest = (
  requestId: string,
  targetId: string,
  input: SellerSpriteAbaResearchInput,
): SellerSpriteAbaResearchRequest => ({
  namespace: MESSAGE_NAMESPACE,
  kind: 'request',
  protocolVersion: PROTOCOL_VERSION,
  action: SELLERSPRITE_ABA_RESEARCH_ACTION,
  requestId,
  payload: { targetId, input },
})

export const isSellerSpriteAbaPeriodsRequest = (value: unknown): value is SellerSpriteAbaPeriodsRequest =>
  isRecord(value)
  && value.namespace === MESSAGE_NAMESPACE
  && value.kind === 'request'
  && value.protocolVersion === PROTOCOL_VERSION
  && value.action === SELLERSPRITE_ABA_PERIODS_ACTION
  && isBoundedString(value.requestId, 256)
  && isRecord(value.payload)
  && Object.keys(value.payload).length === 1
  && isBoundedString(value.payload.targetId, 64)

export const isSellerSpriteAbaResearchRequest = (value: unknown): value is SellerSpriteAbaResearchRequest =>
  isRecord(value)
  && value.namespace === MESSAGE_NAMESPACE
  && value.kind === 'request'
  && value.protocolVersion === PROTOCOL_VERSION
  && value.action === SELLERSPRITE_ABA_RESEARCH_ACTION
  && isBoundedString(value.requestId, 256)
  && isRecord(value.payload)
  && Object.keys(value.payload).length === 2
  && isBoundedString(value.payload.targetId, 64)
  && isSellerSpriteAbaResearchInput(value.payload.input)

const isAbaPeriod = (value: unknown): value is SellerSpriteAbaPeriod =>
  isRecord(value)
  && Object.keys(value).length === 2
  && isBoundedString(value.table, 32)
  && isBoundedString(value.label, 64)

const isAbaItem = (value: unknown): value is SellerSpriteAbaItem =>
  isRecord(value)
  && Object.keys(value).length === ABA_ITEM_KEYS.length
  && ABA_ITEM_KEYS.every((key) => Object.hasOwn(value, key))
  && isBoundedString(value.keyword, 512)
  && isNullableBoundedString(value.keywordCn, 512)
  && isNullableBoundedString(value.keywordJp, 512)
  && ['searches', 'clicks', 'impressions', 'purchaseRate', 'purchases', 'products', 'searchRank',
    'searchRankGrowthValue', 'searchRankGrowthRate', 'cvsShareRate', 'clickShareRate']
    .every((key) => isNullableFiniteNumber(value[key]))
  && Array.isArray(value.departments)
  && value.departments.length <= 50
  && value.departments.every((item) => isBoundedString(item, 256))

const isAbaProtocolError = (value: unknown): value is ProtocolError['error'] => {
  if (!isRecord(value) || typeof value.code !== 'string' || Object.keys(value).length > 3) return false
  return (value.targetCode === undefined || typeof value.targetCode === 'string' || typeof value.targetCode === 'number')
    && (value.targetMessage === undefined || typeof value.targetMessage === 'string')
}

export const isSellerSpriteAbaPeriodsResponse = (value: unknown): value is SellerSpriteAbaPeriodsResponse => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'response') return false
  if (value.protocolVersion !== PROTOCOL_VERSION || !isBoundedString(value.requestId, 256)) return false
  if (value.ok === false) return isAbaProtocolError(value.error)
  return value.ok === true
    && value.action === SELLERSPRITE_ABA_PERIODS_ACTION
    && isRecord(value.data)
    && Object.keys(value.data).length === 2
    && Array.isArray(value.data.weekTables)
    && value.data.weekTables.every(isAbaPeriod)
    && Array.isArray(value.data.monthTables)
    && value.data.monthTables.every(isAbaPeriod)
}

export const isSellerSpriteAbaResearchResponse = (value: unknown): value is SellerSpriteAbaResearchResponse => {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE || value.kind !== 'response') return false
  if (value.protocolVersion !== PROTOCOL_VERSION || !isBoundedString(value.requestId, 256)) return false
  if (value.ok === false) return isAbaProtocolError(value.error)
  if (value.ok !== true || value.action !== SELLERSPRITE_ABA_RESEARCH_ACTION || !isRecord(value.data)) return false
  return Object.keys(value.data).length === 7
    && Number.isInteger(value.data.page) && (value.data.page as number) >= 1
    && Number.isInteger(value.data.pages) && (value.data.pages as number) >= 0
    && Number.isInteger(value.data.size) && (value.data.size as number) >= 1
    && Number.isFinite(value.data.total) && (value.data.total as number) >= 0
    && isNullableFiniteNumber(value.data.took)
    && typeof value.data.hasNextPage === 'boolean'
    && Array.isArray(value.data.items)
    && value.data.items.length <= 50
    && value.data.items.every(isAbaItem)
}
