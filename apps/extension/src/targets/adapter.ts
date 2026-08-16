export type TargetAdapter = {
  targetId: string
  displayName: string
  origin: `https://${string}`
  permissionOrigins: readonly [`https://${string}/*`]
  enabled: boolean
}

const TARGET_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/

export const isTrustedTargetOrigin = (origin: unknown): origin is `https://${string}` => {
  if (typeof origin !== 'string') return false
  try {
    const parsed = new URL(origin)
    return parsed.protocol === 'https:'
      && parsed.origin === origin
      && parsed.pathname === '/'
      && parsed.search === ''
      && parsed.hash === ''
      && parsed.username === ''
      && parsed.password === ''
  } catch {
    return false
  }
}

export const isTrustedPermissionOrigin = (value: unknown): value is `https://${string}/*` => {
  if (typeof value !== 'string' || !value.endsWith('/*')) return false
  return isTrustedTargetOrigin(value.slice(0, -2))
}

export const isValidTargetAdapter = (value: unknown): value is TargetAdapter => {
  if (typeof value !== 'object' || value === null) return false
  const adapter = value as Partial<TargetAdapter>
  return typeof adapter.targetId === 'string'
    && TARGET_ID_PATTERN.test(adapter.targetId)
    && typeof adapter.displayName === 'string'
    && adapter.displayName.length > 0
    && adapter.displayName.length <= 80
    && isTrustedTargetOrigin(adapter.origin)
    && Array.isArray(adapter.permissionOrigins)
    && adapter.permissionOrigins.length === 1
    && adapter.permissionOrigins[0] === `${adapter.origin}/*`
    && isTrustedPermissionOrigin(adapter.permissionOrigins[0])
    && typeof adapter.enabled === 'boolean'
}

export const createTargetAdapter = (input: {
  targetId: string
  displayName: string
  origin: `https://${string}`
  enabled?: boolean
}): TargetAdapter => {
  const adapter = {
    targetId: input.targetId,
    displayName: input.displayName,
    origin: input.origin,
    permissionOrigins: [`${input.origin}/*`] as [`https://${string}/*`],
    enabled: input.enabled ?? true,
  }
  if (!isValidTargetAdapter(adapter)) throw new Error('INVALID_TARGET_ADAPTER')
  return Object.freeze(adapter)
}