export type ConfigHttpMethod = 'GET' | 'POST'

export const TARGET_OPERATIONS = [
  'CHECK_LOGIN', 'GET_PROFILE', 'SELLERSPRITE_KEYWORD_REVERSE', 'SELLERSPRITE_MONTHLY', 'SELLERSPRITE_MARKET_RESEARCH', 'SELLERSPRITE_ABA_PERIODS', 'SELLERSPRITE_ABA_RESEARCH', 'COMPETITOR_RESEARCH',
  'PRODUCT_SELECTION', 'MARKET_SELECTION', 'KEYWORD_PRODUCT_RESEARCH', 'KEYWORD_MINING',
  'SELLERSPRITE_CATEGORY_NODES', 'SELLERSPRITE_REVIEW_COMMENTS',
] as const
const INTERNAL_TARGET_OPERATIONS = ['SELLERSPRITE_KEYWORD_REVERSE_PREPARE'] as const
export type PublicTargetOperation = (typeof TARGET_OPERATIONS)[number]
export type TargetOperation = PublicTargetOperation | (typeof INTERNAL_TARGET_OPERATIONS)[number]

export type TargetOperationPolicy = {
  enabled: boolean
  path: `/${string}`
  method: ConfigHttpMethod
  timeoutMs: number
  response: 'login-status' | 'html-login-probe' | 'profile' | 'keyword-reverse' | 'monthly' | 'market-research' | 'aba-periods' | 'aba-research' | 'competitor-research' | 'product-selection' | 'html-session' | 'keyword-mining' | 'category-nodes' | 'review-comments'
}

export type TargetOperationOverrides = Readonly<Record<string, {
  enabled?: boolean
  path?: string
  method?: ConfigHttpMethod
  timeoutMs?: number
  response?: TargetOperationPolicy['response']
}>>

export const isTargetOperation = (value: string): value is TargetOperation =>
  TARGET_OPERATIONS.includes(value as (typeof TARGET_OPERATIONS)[number])
  || INTERNAL_TARGET_OPERATIONS.includes(value as (typeof INTERNAL_TARGET_OPERATIONS)[number])

export const isSafeEndpointPath = (value: unknown): value is `/${string}` => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 512) return false
  if (value.includes('\\') || value.includes('://') || /[\u0000-\u001F]/.test(value)) return false
  return !value.split('/').some((segment) => segment === '..')
}

export const resolveOperationPolicy = (
  operations: Readonly<Record<TargetOperation, TargetOperationPolicy>>,
  operation: string,
  overrides: TargetOperationOverrides = {},
): TargetOperationPolicy | undefined => {
  if (!isTargetOperation(operation)) return undefined
  const base = operations[operation]
  if (!base) return undefined
  const override = overrides[operation]
  if (!override) return base
  const resolved = { ...base, ...override }
  if (!isSafeEndpointPath(resolved.path)
    || resolved.path !== base.path
    || resolved.method !== base.method
    || !Number.isInteger(resolved.timeoutMs)
    || resolved.timeoutMs < 100
    || resolved.timeoutMs > base.timeoutMs
    || resolved.response !== base.response
    || typeof resolved.enabled !== 'boolean') return undefined
  return resolved as TargetOperationPolicy
}

export const createExampleOperationPolicy = (): Readonly<Record<TargetOperation, TargetOperationPolicy>> => Object.freeze({
  CHECK_LOGIN: Object.freeze({
    enabled: true,
    path: '/api/me',
    method: 'GET',
    timeoutMs: 8_000,
    response: 'login-status',
  }),
  GET_PROFILE: Object.freeze({
    enabled: true,
    path: '/api/v2/profile',
    method: 'GET',
    timeoutMs: 10_000,
    response: 'profile',
  }),
  SELLERSPRITE_KEYWORD_REVERSE_PREPARE: Object.freeze({
    enabled: false,
    path: '/v3/api/relation/stat-keywords',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'keyword-reverse',
  }),
  SELLERSPRITE_KEYWORD_REVERSE: Object.freeze({
    enabled: false,
    path: '/v3/api/relation/reversing',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'keyword-reverse',
  }),
  SELLERSPRITE_MONTHLY: Object.freeze({
    enabled: false,
    path: '/v3/api/relation/ta/monthly',
    method: 'GET',
    timeoutMs: 15_000,
    response: 'monthly',
  }),
  SELLERSPRITE_MARKET_RESEARCH: Object.freeze({
    enabled: false,
    path: '/v2/market-research',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'market-research',
  }),
  SELLERSPRITE_ABA_PERIODS: Object.freeze({
    enabled: false,
    path: '/v3/api/aba-research/tables',
    method: 'GET',
    timeoutMs: 15_000,
    response: 'aba-periods',
  }),
  SELLERSPRITE_ABA_RESEARCH: Object.freeze({
    enabled: false,
    path: '/v3/api/aba-research',
    method: 'POST',
    timeoutMs: 20_000,
    response: 'aba-research',
  }),
  COMPETITOR_RESEARCH: Object.freeze({
    enabled: false,
    path: '/v3/api/competing-lookup',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'competitor-research',
  }),
  PRODUCT_SELECTION: Object.freeze({
    enabled: false,
    path: '/v3/api/product-research',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'product-selection',
  }),
  MARKET_SELECTION: Object.freeze({
    enabled: false,
    path: '/v2/market-research',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'html-session',
  }),
  KEYWORD_PRODUCT_RESEARCH: Object.freeze({
    enabled: false,
    path: '/v2/keyword-research',
    method: 'GET',
    timeoutMs: 15_000,
    response: 'html-session',
  }),
  KEYWORD_MINING: Object.freeze({
    enabled: true,
    path: '/v3/api/keyword-miner',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'keyword-mining',
  }),
  SELLERSPRITE_CATEGORY_NODES: Object.freeze({
    enabled: false,
    path: '/v2/competitor-lookup/nodes',
    method: 'GET',
    timeoutMs: 15_000,
    response: 'category-nodes',
  }),
  SELLERSPRITE_REVIEW_COMMENTS: Object.freeze({
    enabled: false,
    path: '/v3/api/review-analysis/comment',
    method: 'POST',
    timeoutMs: 20_000,
    response: 'review-comments',
  }),
})

export const createSellerSpriteOperationPolicy = (): Readonly<Record<TargetOperation, TargetOperationPolicy>> => Object.freeze({
  CHECK_LOGIN: Object.freeze({
    enabled: true,
    path: '/v2/me',
    method: 'GET',
    timeoutMs: 8_000,
    response: 'html-login-probe',
  }),
  GET_PROFILE: Object.freeze({
    enabled: false,
    path: '/v2/me',
    method: 'GET',
    timeoutMs: 8_000,
    response: 'profile',
  }),
  SELLERSPRITE_KEYWORD_REVERSE_PREPARE: Object.freeze({
    enabled: true,
    path: '/v3/api/relation/stat-keywords',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'keyword-reverse',
  }),
  SELLERSPRITE_KEYWORD_REVERSE: Object.freeze({
    enabled: true,
    path: '/v3/api/relation/reversing',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'keyword-reverse',
  }),
  SELLERSPRITE_MONTHLY: Object.freeze({
    enabled: true,
    path: '/v3/api/relation/ta/monthly',
    method: 'GET',
    timeoutMs: 15_000,
    response: 'monthly',
  }),
  SELLERSPRITE_MARKET_RESEARCH: Object.freeze({
    enabled: true,
    path: '/v2/market-research',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'market-research',
  }),
  SELLERSPRITE_ABA_PERIODS: Object.freeze({
    enabled: true,
    path: '/v3/api/aba-research/tables',
    method: 'GET',
    timeoutMs: 15_000,
    response: 'aba-periods',
  }),
  SELLERSPRITE_ABA_RESEARCH: Object.freeze({
    enabled: true,
    path: '/v3/api/aba-research',
    method: 'POST',
    timeoutMs: 20_000,
    response: 'aba-research',
  }),
  COMPETITOR_RESEARCH: Object.freeze({
    enabled: true,
    path: '/v3/api/competing-lookup',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'competitor-research',
  }),
  PRODUCT_SELECTION: Object.freeze({
    enabled: true,
    path: '/v3/api/product-research',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'product-selection',
  }),
  MARKET_SELECTION: Object.freeze({
    enabled: true,
    path: '/v2/market-research',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'html-session',
  }),
  KEYWORD_PRODUCT_RESEARCH: Object.freeze({
    enabled: true,
    path: '/v2/keyword-research',
    method: 'GET',
    timeoutMs: 15_000,
    response: 'html-session',
  }),
  KEYWORD_MINING: Object.freeze({
    enabled: true,
    path: '/v3/api/keyword-miner',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'keyword-mining',
  }),
  SELLERSPRITE_CATEGORY_NODES: Object.freeze({
    enabled: true,
    path: '/v2/competitor-lookup/nodes',
    method: 'GET',
    timeoutMs: 15_000,
    response: 'category-nodes',
  }),
  SELLERSPRITE_REVIEW_COMMENTS: Object.freeze({
    enabled: true,
    path: '/v3/api/review-analysis/comment',
    method: 'POST',
    timeoutMs: 20_000,
    response: 'review-comments',
  }),
})