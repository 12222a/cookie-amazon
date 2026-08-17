import type { RemoteConfig, RemoteOperationConfig } from '@cookie-amazon/remote-config'
import type { TargetAdapter } from './adapter'
import {
  TARGET_OPERATIONS,
  resolveOperationPolicy,
  type TargetOperation,
  type TargetOperationOverrides,
} from './policy'

export type RuntimeTargetPolicy = {
  enabled: boolean
  features: { profile: boolean }
  operationOverrides: TargetOperationOverrides
  capabilities: readonly TargetOperation[]
}

const operationOverride = (
  adapter: TargetAdapter,
  operation: TargetOperation,
  remote: RemoteOperationConfig | undefined,
  featureEnabled: boolean,
): TargetOperationOverrides[string] => {
  const base = adapter.operations[operation]
  if (!remote) return { enabled: base.enabled && featureEnabled }
  if (remote.method !== base.method
    || remote.path !== base.path
    || remote.timeoutMs > base.timeoutMs) return { enabled: false }
  return {
    enabled: base.enabled && featureEnabled && remote.enabled,
    path: base.path,
    method: base.method,
    timeoutMs: remote.timeoutMs,
    response: base.response,
  }
}

export const resolveRuntimeTargetPolicy = (
  adapter: TargetAdapter,
  config: RemoteConfig | null,
): RuntimeTargetPolicy => {
  const remoteTarget = config?.targets[adapter.targetId]
  const enabled = adapter.enabled && (remoteTarget?.enabled ?? true)
  const profileEnabled = enabled
    && (config?.features.profile ?? true)
    && (remoteTarget?.features.profile ?? true)

  const operationOverrides = Object.fromEntries(TARGET_OPERATIONS.map((operation) => {
    const featureEnabled = operation === 'GET_PROFILE' ? profileEnabled : enabled
    return [operation, operationOverride(adapter, operation, remoteTarget?.operations[operation], featureEnabled)]
  })) as TargetOperationOverrides

  const capabilities = TARGET_OPERATIONS.filter((operation) => {
    const policy = resolveOperationPolicy(adapter.operations, operation, operationOverrides)
    if (policy?.enabled !== true) return false
    if (operation !== 'GET_PROFILE') return true
    const loginPolicy = resolveOperationPolicy(adapter.operations, 'CHECK_LOGIN', operationOverrides)
    return loginPolicy?.enabled === true
  })

  return { enabled, features: { profile: profileEnabled }, operationOverrides, capabilities }
}

export const targetOverridesFromConfig = (
  adapters: readonly TargetAdapter[],
  config: RemoteConfig | null,
): Readonly<Record<string, { enabled: boolean }>> => Object.fromEntries(
  adapters.map((adapter) => [adapter.targetId, { enabled: resolveRuntimeTargetPolicy(adapter, config).enabled }]),
)