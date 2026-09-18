import { isRuntimeBridgeRequest } from '@cookie-amazon/protocol'

export const EXTENSION_RUNTIME_REQUEST_ACTION = 'COOKIE_AMAZON_EXTENSION_RUNTIME_REQUEST'

export type ExtensionRuntimeRequestEnvelope = {
  action: typeof EXTENSION_RUNTIME_REQUEST_ACTION
  request: unknown
}

export const isExtensionRuntimeRequestEnvelope = (
  value: unknown,
): value is ExtensionRuntimeRequestEnvelope =>
  typeof value === 'object'
  && value !== null
  && (value as { action?: unknown }).action === EXTENSION_RUNTIME_REQUEST_ACTION
  && isRuntimeBridgeRequest((value as { request?: unknown }).request)