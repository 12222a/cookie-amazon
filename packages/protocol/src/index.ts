export const PROTOCOL_VERSION = 1 as const
export const MESSAGE_NAMESPACE = 'cookie-amazon-platform' as const
export const WEB_ORIGIN = 'http://localhost:5173' as const
export const REMOTE_CONFIG_ORIGIN = 'http://localhost:8787' as const
export const PING_ACTION = 'PING' as const
export const CAPABILITIES = [
  'PING',
  'LIST_TARGETS',
  'GET_TARGET_STATUS',
  'REQUEST_TARGET_PERMISSION',
  'REMOVE_TARGET_PERMISSION',
  'CHECK_LOGIN',
  'GET_PROFILE',
  'SELLERSPRITE_KEYWORD_REVERSE',
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
  error: { code: ProtocolErrorCode }
}

export type PingResponse = PingSuccess | ProtocolError

export const isAllowedWebOrigin = (origin: string): boolean => origin === WEB_ORIGIN

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
export type TargetLoginData = {
  targetId: string
  loggedIn: boolean
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
    return typeof value.data.targetId === 'string' && typeof value.data.loggedIn === 'boolean'
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

export type JsonPrimitive = string | number | boolean | null

export type SellerSpriteKeywordReverseInput = {
  market: string
  ac: boolean
  asin: string
  badges: JsonPrimitive[]
  conversionKeywordTypes: JsonPrimitive[]
  desc: boolean
  exactly: boolean
  filterDeletedKeywords: boolean
  keywordBidMatchType: string
  limit: number
  month: string
  order: string
  skip: number
  trafficKeywordTypes: JsonPrimitive[]
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
  'market', 'ac', 'asin', 'badges', 'conversionKeywordTypes', 'desc', 'exactly',
  'filterDeletedKeywords', 'keywordBidMatchType', 'limit', 'month', 'order', 'skip',
  'trafficKeywordTypes',
] as const

const isBoundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

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
  return isBoundedString(value.market, 32)
    && typeof value.ac === 'boolean'
    && isBoundedString(value.asin, 64)
    && isJsonPrimitiveArray(value.badges)
    && isJsonPrimitiveArray(value.conversionKeywordTypes)
    && typeof value.desc === 'boolean'
    && typeof value.exactly === 'boolean'
    && typeof value.filterDeletedKeywords === 'boolean'
    && isBoundedString(value.keywordBidMatchType, 64)
    && typeof value.limit === 'number'
    && Number.isInteger(value.limit) && value.limit > 0 && value.limit <= 100
    && isBoundedString(value.month, 32)
    && isBoundedString(value.order, 64)
    && typeof value.skip === 'number'
    && Number.isInteger(value.skip) && value.skip >= 0
    && isJsonPrimitiveArray(value.trafficKeywordTypes)
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
    && Object.keys(value.data).length === 2
    && typeof value.data.asin === 'string'
    && Array.isArray(value.data.items)
    && value.data.items.every(isKeywordItem)
}