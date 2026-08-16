export const REMOTE_CONFIG_SCHEMA_VERSION = 1 as const
export const DEFAULT_REMOTE_CONFIG_TTL_MS = 30 * 60 * 1000
export const REMOTE_CONFIG_KEY_PREFIX = 'extension'

export type ConfigHttpMethod = 'GET' | 'POST'

export type RemoteOperationConfig = {
  enabled: boolean
  path: `/${string}`
  method: ConfigHttpMethod
  timeoutMs: number
}

export type RemoteTargetConfig = {
  enabled: boolean
  features: Record<string, boolean>
  operations: Record<string, RemoteOperationConfig>
}

export type RemoteConfig = {
  schemaVersion: typeof REMOTE_CONFIG_SCHEMA_VERSION
  configVersion: number
  minimumExtensionVersion: string
  features: Record<string, boolean>
  targets: Record<string, RemoteTargetConfig>
}

export type ConfigValidationResult =
  | { ok: true; config: RemoteConfig }
  | { ok: false; code: 'CONFIG_INVALID'; reason: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isBooleanMap = (value: unknown): value is Record<string, boolean> =>
  isRecord(value) && Object.values(value).every((item) => typeof item === 'boolean')

const isSafeKey = (value: string): boolean =>
  value.length > 0 && value.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(value)

const isSafePath = (value: unknown): value is `/${string}` => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 512) return false
  if (value.includes('\\') || value.includes('://') || /[\u0000-\u001F]/.test(value)) return false
  return !value.split('/').some((segment) => segment === '..')
}

const isOperation = (value: unknown): value is RemoteOperationConfig => {
  if (!isRecord(value)) return false
  return typeof value.enabled === 'boolean'
    && isSafePath(value.path)
    && (value.method === 'GET' || value.method === 'POST')
    && typeof value.timeoutMs === 'number'
    && Number.isInteger(value.timeoutMs)
    && value.timeoutMs >= 100
    && value.timeoutMs <= 30_000
}

const isTarget = (value: unknown): value is RemoteTargetConfig => {
  if (!isRecord(value)) return false
  if (typeof value.enabled !== 'boolean' || !isBooleanMap(value.features) || !isRecord(value.operations)) return false
  return Object.entries(value.operations).every(([name, operation]) => isSafeKey(name) && isOperation(operation))
}

export const validateRemoteConfig = (value: unknown): ConfigValidationResult => {
  if (!isRecord(value)) return { ok: false, code: 'CONFIG_INVALID', reason: 'CONFIG_NOT_OBJECT' }
  if (value.schemaVersion !== REMOTE_CONFIG_SCHEMA_VERSION) {
    return { ok: false, code: 'CONFIG_INVALID', reason: 'UNSUPPORTED_SCHEMA_VERSION' }
  }
  if (typeof value.configVersion !== 'number' || !Number.isSafeInteger(value.configVersion) || value.configVersion < 0) {
    return { ok: false, code: 'CONFIG_INVALID', reason: 'INVALID_CONFIG_VERSION' }
  }
  if (typeof value.minimumExtensionVersion !== 'string' || value.minimumExtensionVersion.length === 0 || value.minimumExtensionVersion.length > 64) {
    return { ok: false, code: 'CONFIG_INVALID', reason: 'INVALID_MINIMUM_EXTENSION_VERSION' }
  }
  if (!isBooleanMap(value.features) || !isRecord(value.targets)) {
    return { ok: false, code: 'CONFIG_INVALID', reason: 'INVALID_CONFIG_COLLECTIONS' }
  }
  if (!Object.entries(value.targets).every(([targetId, target]) => isSafeKey(targetId) && isTarget(target))) {
    return { ok: false, code: 'CONFIG_INVALID', reason: 'INVALID_TARGET_CONFIG' }
  }

  return { ok: true, config: value as RemoteConfig }
}

export const parseRemoteConfig = (value: string): ConfigValidationResult => {
  try {
    return validateRemoteConfig(JSON.parse(value) as unknown)
  } catch {
    return { ok: false, code: 'CONFIG_INVALID', reason: 'MALFORMED_JSON' }
  }
}

export const createConfigKey = (environment: string): string => {
  if (!isSafeKey(environment)) throw new Error('INVALID_CONFIG_ENVIRONMENT')
  return `${REMOTE_CONFIG_KEY_PREFIX}:${environment}:config`
}

export const createDefaultRemoteConfig = (): RemoteConfig => ({
  schemaVersion: REMOTE_CONFIG_SCHEMA_VERSION,
  configVersion: 0,
  minimumExtensionVersion: '0.1.0',
  features: {},
  targets: {},
})