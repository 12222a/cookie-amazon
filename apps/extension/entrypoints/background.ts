import { onMessage } from 'webext-bridge/background'
import {
  CAPABILITIES,
  MESSAGE_NAMESPACE,
  PROTOCOL_VERSION,
  TARGET_ACTIONS,
  isPingRequest,
  isTargetRequest,
  type PingResponse,
  type ProtocolError,
  type TargetDescriptor,
  type TargetResponse,
  type TargetSuccess,
} from '@cookie-amazon/protocol'
import type { RemoteConfig } from '@cookie-amazon/remote-config'
import { ExtensionRemoteConfigManager } from '../src/remote-config'
import { TargetClient, TargetClientError } from '../src/targets/client'
import { TargetPermissionManager } from '../src/targets/permissions'
import { TARGET_REGISTRY } from '../src/targets/registry'
import { resolveRuntimeTargetPolicy } from '../src/targets/runtime-policy'

const permissionManager = new TargetPermissionManager(TARGET_REGISTRY, browser.permissions)
const configManager = new ExtensionRemoteConfigManager(browser.storage.local)

const invalidMessage = (requestId = 'unknown'): ProtocolError => ({
  namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
  requestId, ok: false, error: { code: 'INVALID_MESSAGE' },
})

const targetError = (requestId: string, code: ProtocolError['error']['code']): ProtocolError => ({
  namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
  requestId, ok: false, error: { code },
})

const descriptor = async (targetId: string, config: RemoteConfig | null): Promise<TargetDescriptor | ProtocolError> => {
  const adapter = TARGET_REGISTRY.get(targetId)
  if (!adapter) return targetError('unknown', 'UNKNOWN_TARGET')
  const policy = resolveRuntimeTargetPolicy(adapter, config)
  const granted = policy.enabled && await permissionManager.hasPermission(targetId)
  const status = TARGET_REGISTRY.status(targetId, granted, { [targetId]: { enabled: policy.enabled } })
  return {
    targetId: adapter.targetId,
    displayName: adapter.displayName,
    origin: adapter.origin,
    enabled: policy.enabled,
    status: status === 'unknown' ? 'disabled' : status,
  }
}

const handleTargetMessage = async ({ data }: { data: unknown }): Promise<TargetResponse> => {
  if (!isTargetRequest(data)) return invalidMessage()
  const config = await configManager.load()

  if (data.action === 'LIST_TARGETS') {
    const targets = await Promise.all(TARGET_REGISTRY.list().map(async (item) => {
      const target = await descriptor(item.targetId, config)
      if ('targetId' in target) return target
      return {
        targetId: item.targetId,
        displayName: item.displayName,
        origin: item.origin,
        enabled: item.enabled,
        status: 'disabled' as const,
      }
    }))
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId: data.requestId, action: data.action, ok: true, data: { targets },
    } satisfies TargetSuccess
  }

  const targetId = data.payload?.targetId
  if (!targetId) return invalidMessage(data.requestId)
  const adapter = TARGET_REGISTRY.get(targetId)
  if (!adapter) return targetError(data.requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, config)

  if (data.action === 'REMOVE_TARGET_PERMISSION') {
    const removed = await permissionManager.removePermission(targetId)
    const granted = removed ? await permissionManager.hasPermission(targetId) : true
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId: data.requestId, action: data.action, ok: true,
      data: {
        targetId,
        granted,
        status: runtimePolicy.enabled ? (granted ? 'ready' : 'permission-required') : 'disabled',
      },
    } satisfies TargetSuccess
  }

  if (data.action === 'GET_TARGET_STATUS') {
    const granted = await permissionManager.hasPermission(targetId)
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId: data.requestId, action: data.action, ok: true,
      data: {
        targetId: adapter.targetId, displayName: adapter.displayName, origin: adapter.origin,
        enabled: runtimePolicy.enabled,
        status: (() => {
          const status = TARGET_REGISTRY.status(targetId, granted, { [targetId]: { enabled: runtimePolicy.enabled } })
          return status === 'unknown' ? 'disabled' : status
        })(),
        granted,
        capabilities: runtimePolicy.capabilities,
      },
    } satisfies TargetSuccess
  }

  if (!runtimePolicy.enabled) return targetError(data.requestId, 'TARGET_DISABLED')

  if (data.action === 'REQUEST_TARGET_PERMISSION') {
    const granted = await permissionManager.requestPermission(targetId)
    if (!granted) return targetError(data.requestId, 'PERMISSION_REQUEST_DENIED')
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId: data.requestId, action: data.action, ok: true,
      data: { targetId, granted: true, status: 'ready' },
    } satisfies TargetSuccess
  }

  if (data.action === 'CHECK_LOGIN') {
    if (!runtimePolicy.capabilities.includes('CHECK_LOGIN')) {
      return targetError(data.requestId, 'OPERATION_DISABLED')
    }
    if (!(await permissionManager.hasPermission(targetId))) {
      return targetError(data.requestId, 'TARGET_PERMISSION_MISSING')
    }
    const client = new TargetClient(adapter, undefined, runtimePolicy.operationOverrides)
    try {
      const result = await adapter.checkLogin(client)
      return {
        namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
        requestId: data.requestId, action: data.action, ok: true,
        data: { targetId, loggedIn: result.loggedIn },
      } satisfies TargetSuccess
    } catch (error: unknown) {
      if (error instanceof TargetClientError) return targetError(data.requestId, error.code)
      return targetError(data.requestId, 'TARGET_API_ERROR')
    }
  }

  if (data.action === 'GET_PROFILE') {
    if (!runtimePolicy.features.profile) return targetError(data.requestId, 'FEATURE_DISABLED')
    if (!runtimePolicy.capabilities.includes('GET_PROFILE')) {
      return targetError(data.requestId, 'OPERATION_DISABLED')
    }
    if (!(await permissionManager.hasPermission(targetId))) {
      return targetError(data.requestId, 'TARGET_PERMISSION_MISSING')
    }
    const client = new TargetClient(adapter, undefined, runtimePolicy.operationOverrides)
    try {
      const login = await adapter.checkLogin(client)
      if (!login.loggedIn) return targetError(data.requestId, 'TARGET_NOT_LOGGED_IN')
      const profile = await adapter.getProfile(client)
      return {
        namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
        requestId: data.requestId, action: data.action, ok: true,
        data: { targetId, profile },
      } satisfies TargetSuccess
    } catch (error: unknown) {
      if (error instanceof TargetClientError) return targetError(data.requestId, error.code)
      return targetError(data.requestId, 'TARGET_API_ERROR')
    }
  }

  return targetError(data.requestId, 'UNKNOWN_ACTION')
}

export default defineBackground(() => {
  onMessage('PING', ({ data }: { data: unknown }) => {
    if (!isPingRequest(data)) return invalidMessage()
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId: data.requestId, ok: true,
      data: {
        connected: true,
        extensionVersion: browser.runtime.getManifest().version,
        protocolVersion: PROTOCOL_VERSION,
        capabilities: [...CAPABILITIES],
      },
    } satisfies PingResponse
  })

  for (const action of TARGET_ACTIONS) onMessage(action, handleTargetMessage)
})

export { handleTargetMessage }