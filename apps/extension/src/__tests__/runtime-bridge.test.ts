import { describe, expect, it } from 'vitest'
import { createPingRequest } from '@cookie-amazon/protocol'
import {
  EXTENSION_RUNTIME_REQUEST_ACTION,
  isExtensionRuntimeRequestEnvelope,
} from '../runtime-bridge'

describe('native extension runtime bridge', () => {
  it('accepts a valid runtime request envelope', () => {
    expect(isExtensionRuntimeRequestEnvelope({
      action: EXTENSION_RUNTIME_REQUEST_ACTION,
      request: createPingRequest('ping-request'),
    })).toBe(true)
  })

  it('rejects unrelated or malformed runtime messages', () => {
    expect(isExtensionRuntimeRequestEnvelope({
      action: 'OTHER_ACTION',
      request: createPingRequest('ping-request'),
    })).toBe(false)
    expect(isExtensionRuntimeRequestEnvelope({
      action: EXTENSION_RUNTIME_REQUEST_ACTION,
      request: { action: 'PING' },
    })).toBe(false)
  })
})