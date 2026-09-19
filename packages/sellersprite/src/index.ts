export const SELLERSPRITE_TARGET_ID = 'sellersprite' as const
export const SELLERSPRITE_ORIGIN = 'https://www.sellersprite.com' as const
export const SELLERSPRITE_PERMISSION_ORIGIN = 'https://www.sellersprite.com/*' as const
export const SELLERSPRITE_API_ORIGIN = 'https://api.sellersprite.com' as const

export const SELLERSPRITE_REVERSE_ASIN_API = Object.freeze({
  origin: SELLERSPRITE_API_ORIGIN,
  method: 'POST',
  path: '/v1/traffic/keyword',
} as const)

export const SELLERSPRITE_KEYWORD_MINING_API = Object.freeze({
  origin: SELLERSPRITE_API_ORIGIN,
  method: 'GET',
  path: '/v1/keyword/miner',
} as const)

export const SELLERSPRITE_API_AUTH_MODE = 'server-secret-key-only' as const

export type SellerSpriteApiAuthMode = typeof SELLERSPRITE_API_AUTH_MODE

export type SellerSpriteWebEndpointContract = Readonly<{
  path: `/${string}`
  method: SellerSpriteApiMethod
  responseKind: 'json' | 'html'
}>

export type SellerSpriteWebCapabilityContract = Readonly<{
  capabilityId: SellerSpriteCapabilityId
  origin: typeof SELLERSPRITE_ORIGIN
  status: 'web-endpoint-confirmed'
  authMode: 'browser-cookie-automatic'
  endpoints: readonly SellerSpriteWebEndpointContract[]
}>

const webEndpoint = (
  path: `/${string}`,
  method: SellerSpriteApiMethod,
  responseKind: SellerSpriteWebEndpointContract['responseKind'],
): SellerSpriteWebEndpointContract => Object.freeze({ path, method, responseKind })

export const SELLERSPRITE_WEB_CAPABILITY_CONTRACTS = Object.freeze([
  Object.freeze({
    capabilityId: 'CHECK_LOGIN', origin: SELLERSPRITE_ORIGIN, status: 'web-endpoint-confirmed', authMode: 'browser-cookie-automatic',
    endpoints: Object.freeze([webEndpoint('/v3/api/client', 'GET', 'json')]),
  }),
  Object.freeze({
    capabilityId: 'KEYWORD_REVERSE', origin: SELLERSPRITE_ORIGIN, status: 'web-endpoint-confirmed', authMode: 'browser-cookie-automatic',
    endpoints: Object.freeze([
      webEndpoint('/v3/api/relation/stat-keywords', 'POST', 'json'),
      webEndpoint('/v3/api/relation/ta/monthly', 'GET', 'json'),
      webEndpoint('/v3/api/relation/reversing', 'POST', 'json'),
      webEndpoint('/v3/api/relation/ta/high-frequency-words-new', 'POST', 'json'),
    ]),
  }),
  Object.freeze({
    capabilityId: 'COMPETITOR_RESEARCH', origin: SELLERSPRITE_ORIGIN, status: 'web-endpoint-confirmed', authMode: 'browser-cookie-automatic',
    endpoints: Object.freeze([webEndpoint('/v3/api/competing-lookup', 'POST', 'json')]),
  }),
  Object.freeze({
    capabilityId: 'PRODUCT_SELECTION', origin: SELLERSPRITE_ORIGIN, status: 'web-endpoint-confirmed', authMode: 'browser-cookie-automatic',
    endpoints: Object.freeze([webEndpoint('/v3/api/product-research', 'POST', 'json')]),
  }),
  Object.freeze({
    capabilityId: 'MARKET_SELECTION', origin: SELLERSPRITE_ORIGIN, status: 'web-endpoint-confirmed', authMode: 'browser-cookie-automatic',
    endpoints: Object.freeze([webEndpoint('/v2/market-research', 'POST', 'html')]),
  }),
  Object.freeze({
    capabilityId: 'KEYWORD_PRODUCT_RESEARCH', origin: SELLERSPRITE_ORIGIN, status: 'web-endpoint-confirmed', authMode: 'browser-cookie-automatic',
    endpoints: Object.freeze([webEndpoint('/v2/keyword-research', 'GET', 'html')]),
  }),
  Object.freeze({
    capabilityId: 'KEYWORD_MINING', origin: SELLERSPRITE_ORIGIN, status: 'web-endpoint-confirmed', authMode: 'browser-cookie-automatic',
    endpoints: Object.freeze([
      webEndpoint('/v3/api/keyword-miner', 'POST', 'json'),
      webEndpoint('/v3/api/keyword-miner/high/frequency-new', 'POST', 'json'),
      webEndpoint('/v3/api/keyword-miner/deleted/keyword/list', 'GET', 'json'),
      webEndpoint('/v3/api/suggestions', 'GET', 'json'),
    ]),
  }),
] as const satisfies readonly SellerSpriteWebCapabilityContract[])

export const SELLERSPRITE_API_ERROR_CODES = [
  'OK',
  'ERROR_URL_NOT_FOUND',
  'ERROR_SERVER_INTERNAL',
  'ERROR_PARAM',
  'ERROR_SECRET_KEY',
  'ERROR_SECRET_KEY_OVERDUE',
  'ERROR_VISIT_MAX',
  'ERROR_SECRET_KEY_INVALID',
] as const

export type SellerSpriteApiErrorCode = (typeof SELLERSPRITE_API_ERROR_CODES)[number]
export type SellerSpriteApiMethod = 'GET' | 'POST'

export type SellerSpriteApiEnvelope<T> = Readonly<{
  code: SellerSpriteApiErrorCode | (string & {})
  message: string
  data: T | null
}>

export type SellerSpriteReverseAsinInput = Readonly<{
  marketplace: string
  asin: string
  keyword?: string
  month?: string
  page?: number
  size?: number
  order?: Readonly<{ field: string; desc?: boolean }>
}>

export type SellerSpriteReverseAsinItem = Readonly<{
  keywords: string
  keywordCn?: string
  searches?: number
  products?: number
  purchases?: number
  purchaseRate?: number
  bid?: number
  trafficPercentage?: number
  trafficKeywordType?: string
  conversionKeywordType?: string
  updatedTime?: number
}>

export type SellerSpriteReverseAsinData = Readonly<{
  marketplace: string
  asin: string
  total: number
  items: readonly SellerSpriteReverseAsinItem[]
}>

export type SellerSpriteKeywordMiningInput = Readonly<{
  marketplace: string
  keyword: string
  historyDate?: string
  page?: number
  size?: number
  order?: Readonly<{ field: string; desc?: boolean }>
}>

export type SellerSpriteKeywordMiningItem = Readonly<{
  marketplace: string
  keyword: string
  keywordCn?: string
  searches?: number
  purchases?: number
  purchaseRate?: number
  products?: number
  searchRank?: number
  spr?: number
  relevancy?: number
}>

export type SellerSpriteKeywordMiningData = Readonly<{
  items: readonly SellerSpriteKeywordMiningItem[]
}>

export const SELLERSPRITE_CAPABILITY_IDS = [
  'CHECK_LOGIN',
  'KEYWORD_REVERSE',
  'COMPETITOR_RESEARCH',
  'PRODUCT_SELECTION',
  'MARKET_SELECTION',
  'KEYWORD_PRODUCT_RESEARCH',
  'KEYWORD_MINING',
] as const

export type SellerSpriteCapabilityId = (typeof SELLERSPRITE_CAPABILITY_IDS)[number]
export type SellerSpriteCapabilityCategory = 'account' | 'competitor' | 'product' | 'market' | 'keyword'
export type SellerSpriteCapabilityContractStatus = 'contract-confirmed'

export type SellerSpriteCapability = Readonly<{
  id: SellerSpriteCapabilityId
  displayName: string
  category: SellerSpriteCapabilityCategory
  contractStatus: SellerSpriteCapabilityContractStatus
}>

export type SellerSpriteTargetMetadata = Readonly<{
  targetId: typeof SELLERSPRITE_TARGET_ID
  displayName: '卖家精灵'
  origin: typeof SELLERSPRITE_ORIGIN
  permissionOrigin: typeof SELLERSPRITE_PERMISSION_ORIGIN
  capabilityIds: readonly SellerSpriteCapabilityId[]
}>

const defineCapability = (
  id: SellerSpriteCapabilityId,
  displayName: string,
  category: SellerSpriteCapabilityCategory,
): SellerSpriteCapability => Object.freeze({
  id,
  displayName,
  category,
  contractStatus: 'contract-confirmed',
})

const CAPABILITIES: readonly SellerSpriteCapability[] = Object.freeze([
  defineCapability('CHECK_LOGIN', '登录状态检测', 'account'),
  defineCapability('KEYWORD_REVERSE', '关键词反查', 'keyword'),
  defineCapability('COMPETITOR_RESEARCH', '查竞品', 'competitor'),
  defineCapability('PRODUCT_SELECTION', '选产品', 'product'),
  defineCapability('MARKET_SELECTION', '选市场', 'market'),
  defineCapability('KEYWORD_PRODUCT_RESEARCH', '关键词选品', 'keyword'),
  defineCapability('KEYWORD_MINING', '关键词挖掘', 'keyword'),
])

const CAPABILITY_BY_ID: ReadonlyMap<SellerSpriteCapabilityId, SellerSpriteCapability> = new Map(
  CAPABILITIES.map((capability) => [capability.id, capability]),
)

const TARGET_METADATA: SellerSpriteTargetMetadata = Object.freeze({
  targetId: SELLERSPRITE_TARGET_ID,
  displayName: '卖家精灵',
  origin: SELLERSPRITE_ORIGIN,
  permissionOrigin: SELLERSPRITE_PERMISSION_ORIGIN,
  capabilityIds: Object.freeze([...SELLERSPRITE_CAPABILITY_IDS]),
})

export const isSellerSpriteCapabilityId = (value: unknown): value is SellerSpriteCapabilityId =>
  typeof value === 'string'
  && SELLERSPRITE_CAPABILITY_IDS.includes(value as SellerSpriteCapabilityId)

export const listSellerSpriteCapabilities = (): readonly SellerSpriteCapability[] => CAPABILITIES

export const getSellerSpriteCapability = (
  capabilityId: string,
): SellerSpriteCapability | undefined => {
  if (!isSellerSpriteCapabilityId(capabilityId)) return undefined
  return CAPABILITY_BY_ID.get(capabilityId)
}

export const getSellerSpriteTargetMetadata = (): SellerSpriteTargetMetadata => TARGET_METADATA