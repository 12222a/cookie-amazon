import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SellerSpriteKeywordReverseData } from '@cookie-amazon/protocol'
import { fetchKeywordReverse } from '../keyword-positions-client'
const ok = (data: SellerSpriteKeywordReverseData) => ({
  namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
  requestId: 'r1', action: 'SELLERSPRITE_KEYWORD_REVERSE', ok: true, data,
})
describe('keyword reverse transport', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  it('sends the reverse request through the extension runtime and returns the payload', async () => {
    const send = vi.fn(async (_message: unknown) => ok({ asin: 'B0ABCDEFGH', total: 0, items: [] }))
    const result = await fetchKeywordReverse('B0ABCDEFGH', 'US', { send: send as never })
    expect(result).toEqual({ kind: 'data', data: { asin: 'B0ABCDEFGH', total: 0, items: [] } })
    const envelope = send.mock.calls[0]?.[0] as unknown as { action: string; request: { payload: { targetId: string; input: unknown } } }
    expect(envelope.action).toBe('COOKIE_AMAZON_EXTENSION_RUNTIME_REQUEST')
    expect(envelope.request.payload.targetId).toBe('sellersprite')
    expect(envelope.request.payload.input).toMatchObject({ asin: 'B0ABCDEFGH', marketId: 1 })
  })
  it('reports an unsupported market without calling the extension', async () => {
    const send = vi.fn()
    const result = await fetchKeywordReverse('B0ABCDEFGH', 'JP', { send: send as never })
    expect(result.kind).toBe('unsupported-market')
    expect(send).not.toHaveBeenCalled()
  })
  it('asks the user to log in when the session is gone', async () => {
    const send = vi.fn(async (_message: unknown) => ({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'r1', action: 'SELLERSPRITE_KEYWORD_REVERSE', ok: false,
      error: { code: 'TARGET_NOT_LOGGED_IN' },
    }))
    const result = await fetchKeywordReverse('B0ABCDEFGH', 'US', { send: send as never })
    expect(result.kind).toBe('not-logged-in')
  })
  it('reports a missing permission as something the user must grant', async () => {
    const send = vi.fn(async (_message: unknown) => ({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'r1', action: 'SELLERSPRITE_KEYWORD_REVERSE', ok: false,
      error: { code: 'TARGET_PERMISSION_MISSING' },
    }))
    const result = await fetchKeywordReverse('B0ABCDEFGH', 'US', { send: send as never })
    expect(result.kind).toBe('permission-required')
  })
  it('degrades to a failure result instead of throwing when the transport rejects', async () => {
    const send = vi.fn(async (_message: unknown) => { throw new Error('extension reloaded') })
    const result = await fetchKeywordReverse('B0ABCDEFGH', 'US', { send: send as never })
    expect(result.kind).toBe('failed')
  })
  it('treats a malformed response as a failure, not as data', async () => {
    const send = vi.fn(async (_message: unknown) => ({ nonsense: true }))
    const result = await fetchKeywordReverse('B0ABCDEFGH', 'US', { send: send as never })
    expect(result.kind).toBe('failed')
  })
})
