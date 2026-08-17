export type ConfigHttpMethod = 'GET' | 'POST'

export const TARGET_OPERATIONS = ['CHECK_LOGIN'] as const
export type TargetOperation = (typeof TARGET_OPERATIONS)[number]

export type TargetOperationPolicy = {
  enabled: boolean
  path: `/${string}`
  method: ConfigHttpMethod
  timeoutMs: number
  response: 'login-status'
}

export type TargetOperationOverrides = Readonly<Record<string, {
  enabled?: boolean
  path?: string
  method?: ConfigHttpMethod
  timeoutMs?: number
  response?: 'login-status'
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
    || (resolved.method !== 'GET' && resolved.method !== 'POST')
    || !Number.isInteger(resolved.timeoutMs)
    || resolved.timeoutMs < 100
    || resolved.timeoutMs > 30_000
    || resolved.response !== 'login-status'
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
})