import { describe, expect, it } from 'vitest'
import {
  createDefaultRemoteConfig,
  type RemoteConfig,
  type RemoteOperationConfig,
  type RemoteTargetConfig,
} from '@cookie-amazon/remote-config'
import { createTargetAdapter } from '../adapter'
import { resolveRuntimeTargetPolicy } from '../runtime-policy'

const adapter = createTargetAdapter({
  targetId: 'example',
  displayName: 'Example',
  origin: 'https://example.com',
})

const remoteOperation = (
  operation: 'CHECK_LOGIN' | 'GET_PROFILE',
  overrides: Partial<RemoteOperationConfig> = {},
): RemoteOperationConfig => ({
  enabled: true,
  path: operation === 'CHECK_LOGIN' ? '/api/me' : '/api/v2/profile',
  method: 'GET',
  timeoutMs: 5_000,
  ...overrides,
})

const remoteTarget = (overrides: Partial<RemoteTargetConfig> = {}): RemoteTargetConfig => ({
  enabled: true,
  features: { profile: true },
  operations: {
    CHECK_LOGIN: remoteOperation('CHECK_LOGIN'),
    GET_PROFILE: remoteOperation('GET_PROFILE'),
  },
  ...overrides,
})

const configWithTarget = (target: RemoteTargetConfig): RemoteConfig => ({
  ...createDefaultRemoteConfig(),
  configVersion: 1,
  features: { profile: true },
  targets: { example: target },
})

describe('runtime target policy', () => {
  it('uses compiled capabilities when no remote config is available', () => {
    const policy = resolveRuntimeTargetPolicy(adapter, null)
    expect(policy.enabled).toBe(true)
    expect(policy.features.profile).toBe(true)
    expect(policy.capabilities).toEqual(['CHECK_LOGIN', 'GET_PROFILE', 'KEYWORD_MINING'])
  })

  it('applies target, feature, and operation kill switches', () => {
    expect(resolveRuntimeTargetPolicy(adapter, configWithTarget(remoteTarget({ enabled: false }))).enabled).toBe(false)

    const featureDisabled = configWithTarget(remoteTarget({ features: { profile: false } }))
    expect(resolveRuntimeTargetPolicy(adapter, featureDisabled).capabilities).toEqual(['CHECK_LOGIN', 'KEYWORD_MINING'])

    const operationDisabled = configWithTarget(remoteTarget({
      operations: {
        ...remoteTarget().operations,
        GET_PROFILE: remoteOperation('GET_PROFILE', { enabled: false }),
      },
    }))
    expect(resolveRuntimeTargetPolicy(adapter, operationDisabled).capabilities).toEqual(['CHECK_LOGIN', 'KEYWORD_MINING'])
  })

  it('cannot change compiled endpoints, methods, or increase timeouts', () => {
    const changedPath = configWithTarget(remoteTarget({
      operations: {
        ...remoteTarget().operations,
        GET_PROFILE: remoteOperation('GET_PROFILE', { path: '/api/arbitrary' }),
      },
    }))
    expect(resolveRuntimeTargetPolicy(adapter, changedPath).capabilities).toEqual(['CHECK_LOGIN', 'KEYWORD_MINING'])

    const changedMethod = configWithTarget(remoteTarget({
      operations: {
        ...remoteTarget().operations,
        GET_PROFILE: remoteOperation('GET_PROFILE', { method: 'POST' }),
      },
    }))
    expect(resolveRuntimeTargetPolicy(adapter, changedMethod).capabilities).toEqual(['CHECK_LOGIN', 'KEYWORD_MINING'])

    const increasedTimeout = configWithTarget(remoteTarget({
      operations: {
        ...remoteTarget().operations,
        GET_PROFILE: remoteOperation('GET_PROFILE', {
          timeoutMs: adapter.operations.GET_PROFILE.timeoutMs + 1,
        }),
      },
    }))
    expect(resolveRuntimeTargetPolicy(adapter, increasedTimeout).capabilities).toEqual(['CHECK_LOGIN', 'KEYWORD_MINING'])
  })

  it('requires login checking for the profile capability and ignores unknown config entries', () => {
    const config = configWithTarget(remoteTarget({
      operations: {
        ...remoteTarget().operations,
        CHECK_LOGIN: remoteOperation('CHECK_LOGIN', { enabled: false }),
        UNKNOWN_OPERATION: {
          enabled: true,
          path: '/api/unknown',
          method: 'GET',
          timeoutMs: 1_000,
        },
      },
    }))
    config.targets.UNKNOWN_TARGET = remoteTarget()

    expect(resolveRuntimeTargetPolicy(adapter, config).capabilities).toEqual(['KEYWORD_MINING'])
  })
})