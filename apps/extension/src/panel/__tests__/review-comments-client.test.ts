import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SellerSpriteReviewCommentsData } from '@cookie-amazon/protocol'
import { fetchSellerSpriteReviews } from '../review-comments-client'

const data: SellerSpriteReviewCommentsData = { page: 1, size: 50, total: 10, took: 1, items: [] }

describe('review comments transport', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('sends a US review request through the extension runtime', async () => {
    const send = vi.fn(async (_message: unknown) => ({
      namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
      requestId: 'review-1', action: 'SELLERSPRITE_REVIEW_COMMENTS', ok: true, data,
    }))
    await expect(fetchSellerSpriteReviews('B0ABCDEFGH', 'US', { send: send as never })).resolves.toEqual({ kind: 'data', data })
    const envelope = send.mock.calls[0]?.[0] as { request: { payload: { input: Record<string, unknown> } } }
    expect(envelope.request.payload.input).toMatchObject({ asin: 'B0ABCDEFGH', market: 'US', pageNum: 1, pageSize: 50 })
  })

  it('does not call the extension for unsupported markets', async () => {
    const send = vi.fn()
    await expect(fetchSellerSpriteReviews('B0ABCDEFGH', 'JP', { send: send as never })).resolves.toEqual({ kind: 'unsupported-market', market: 'JP' })
    expect(send).not.toHaveBeenCalled()
  })

  it('translates login and transport failures into panel states', async () => {
    await expect(fetchSellerSpriteReviews('B0ABCDEFGH', 'US', {
      send: vi.fn(async () => ({
        namespace: 'cookie-amazon-platform', kind: 'response', protocolVersion: 1,
        requestId: 'review-1', action: 'SELLERSPRITE_REVIEW_COMMENTS', ok: false,
        error: { code: 'TARGET_NOT_LOGGED_IN' },
      })) as never,
    })).resolves.toEqual({ kind: 'not-logged-in' })
    await expect(fetchSellerSpriteReviews('B0ABCDEFGH', 'US', {
      send: vi.fn(async () => { throw new Error('extension reloaded') }) as never,
    })).resolves.toMatchObject({ kind: 'failed' })
  })
})
