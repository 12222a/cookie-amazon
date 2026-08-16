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
export type TargetStatusData = TargetDescriptor & { granted: boolean }
export type TargetPermissionData = {
  targetId: string
  granted: boolean
  status: Exclude<TargetState, 'unknown'>
}
export type TargetResponseData = TargetListData | TargetStatusData | TargetPermissionData
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
    return isTargetDescriptor(value.data) && typeof (value.data as TargetStatusData).granted === 'boolean'
  }
  return typeof value.data.targetId === 'string'
    && typeof value.data.granted === 'boolean'
    && isTargetState(value.data.status)
}