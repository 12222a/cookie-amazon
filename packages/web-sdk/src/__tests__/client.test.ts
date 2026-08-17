import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  setNamespace: vi.fn(),
}))

vi.mock('webext-bridge/window', () => bridge)

import { reverseSellerSpriteKeywords } from '../client'

const input = {
  market: 'US', ac: false, asin: 'B000000000', badges: [], conversionKeywordTypes: [],
  desc: true, exactly: false, filterDeletedKeywords: false, keywordBidMatchType: 'broad',
  limit: 20, month: '2026-01', order: 'searches', skip: 0, trafficKeywordTypes: [],
}

describe('SellerSprite web SDK', () => {
  beforeEach(() => {
    bridge.sendMessage.mockReset()
    bridge.setNamespace.mockClear()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { origin: 'http://localhost:5173' },
        setTimeout,
        clearTimeout,
      },
    })
  })

  it('sends the strict keyword reverse request and returns minimized data', async () => {
    const data = { asin: 'B000000000', items: [] }
    bridge.sendMessage.mockResolvedValue({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'response-id', action: 'SELLERSPRITE_KEYWORD_REVERSE', ok: true, data,
    })

    await expect(reverseSellerSpriteKeywords(input)).resolves.toEqual(data)
    expect(bridge.sendMessage).toHaveBeenCalledTimes(1)
    const [action, request, destination] = bridge.sendMessage.mock.calls[0]!
    expect(action).toBe('SELLERSPRITE_KEYWORD_REVERSE')
    expect(destination).toBe('content-script')
    expect(request).toMatchObject({
      namespace: 'cookie-amazon-platform', kind: 'request', protocolVersion: 1,
      action: 'SELLERSPRITE_KEYWORD_REVERSE',
      payload: { targetId: 'sellersprite', input },
    })
  })
})