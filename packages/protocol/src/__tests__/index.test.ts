import { describe, expect, it } from 'vitest'
import {
  createPingRequest,
  createTargetRequest,
  isAllowedWebOrigin,
  isPingRequest,
  isPingResponse,
  isTargetRequest,
  isTargetResponse,
} from '../index'

describe('protocol', () => {
  it('accepts a valid PING request', () => {
    expect(isPingRequest(createPingRequest('request-1'))).toBe(true)
  })

  it('rejects unknown actions and origins', () => {
    expect(isPingRequest({ ...createPingRequest('request-1'), action: 'FETCH' })).toBe(false)
    expect(isAllowedWebOrigin('https://attacker.example')).toBe(false)
  })

  it('accepts a successful response', () => {
    expect(isPingResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-1', ok: true,
      data: { connected: true, extensionVersion: '0.1.0', protocolVersion: 1, capabilities: ['PING'] },
    })).toBe(true)
  })

  it('validates targetId-only requests and responses', () => {
    const request = createTargetRequest('GET_TARGET_STATUS', 'request-2', 'example')
    expect(isTargetRequest(request)).toBe(true)
    expect(isTargetRequest({ ...request, payload: { targetId: 'example', origin: 'https://evil.example' } })).toBe(false)
    expect(isTargetRequest(createTargetRequest('LIST_TARGETS', 'request-3'))).toBe(true)
    expect(isTargetRequest({ ...createTargetRequest('LIST_TARGETS', 'request-3'), payload: { targetId: 'example' } })).toBe(false)
    expect(isTargetResponse({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'request-2', action: 'GET_TARGET_STATUS', ok: true,
      data: {
        targetId: 'example', displayName: 'Example', origin: 'https://example.com',
        enabled: true, status: 'permission-required', granted: false,
      },
    })).toBe(true)
  })
})