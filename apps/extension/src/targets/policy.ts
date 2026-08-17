export type ConfigHttpMethod = 'GET' | 'POST'

export const TARGET_OPERATIONS = ['CHECK_LOGIN', 'GET_PROFILE', 'SELLERSPRITE_KEYWORD_REVERSE', 'COMPETITOR_RESEARCH'] as const
export type TargetOperation = (typeof TARGET_OPERATIONS)[number]

export type TargetOperationPolicy = {
  enabled: boolean
  path: `/${string}`
  method: ConfigHttpMethod
  timeoutMs: number
  response: 'login-status' | 'html-login-probe' | 'profile' | 'keyword-reverse' | 'competitor-research'
}

export type TargetOperationOverrides = Readonly<Record<string, {
  enabled?: boolean
  path?: string
  method?: ConfigHttpMethod
  timeoutMs?: number
  response?: TargetOperationPolicy['response']
}>>

export const isTargetOperation = (value: string): value is TargetOperation =>
  TARGET_OPERATIONS.includes(value as TargetOperation)

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
  SELLERSPRITE_KEYWORD_REVERSE: Object.freeze({
    enabled: false,
    path: '/v3/api/relation/reversing',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'keyword-reverse',
  }),
  COMPETITOR_RESEARCH: Object.freeze({
    enabled: false,
    path: '/v3/api/competing-lookup',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'competitor-research',
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
  SELLERSPRITE_KEYWORD_REVERSE: Object.freeze({
    enabled: true,
    path: '/v3/api/relation/reversing',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'keyword-reverse',
  }),
  COMPETITOR_RESEARCH: Object.freeze({
    enabled: true,
    path: '/v3/api/competing-lookup',
    method: 'POST',
    timeoutMs: 15_000,
    response: 'competitor-research',
  }),
})