import { describe, expect, it, vi } from 'vitest'
import { createTargetAdapter } from '../adapter'
import { TargetClient } from '../client'
import { resolveOperationPolicy } from '../policy'

const adapter = createTargetAdapter({
  targetId: 'example',
  displayName: 'Example',
  origin: 'https://example.com',
})

const response = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })

describe('target operation policy', () => {
  it('allows only the local operation and safe relative endpoint', () => {
    expect(resolveOperationPolicy(adapter.operations, 'CHECK_LOGIN')?.path).toBe('/api/me')
    expect(resolveOperationPolicy(adapter.operations, 'GET_PROFILE')?.path).toBe('/api/v2/profile')
    expect(resolveOperationPolicy(adapter.operations, 'UNKNOWN')).toBeUndefined()
    expect(resolveOperationPolicy(adapter.operations, 'CHECK_LOGIN', {
      CHECK_LOGIN: { path: 'https://evil.example/steal' },
    })).toBeUndefined()
    expect(resolveOperationPolicy(adapter.operations, 'CHECK_LOGIN', {
      CHECK_LOGIN: { path: '/api/other' },
    })).toBeUndefined()
    expect(resolveOperationPolicy(adapter.operations, 'CHECK_LOGIN', {
      CHECK_LOGIN: { timeoutMs: adapter.operations.CHECK_LOGIN.timeoutMs + 1 },
    })).toBeUndefined()
  })
})

describe('TargetClient', () => {
  it('uses the adapter origin and keeps the response to login status', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.com/api/me')
      expect(init?.method).toBe('GET')
      expect(init?.credentials).toBe('include')
      return response({ authenticated: true, cookie: 'must-not-leak' })
    })

    await expect(new TargetClient(adapter, fetcher).checkLogin()).resolves.toEqual({ loggedIn: true })
  })

  it('constructs GET HTML requests without a body and parses only safe metadata', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.com/api/me?market=US')
      expect(init?.method).toBe('GET')
      expect(init?.credentials).toBe('include')
      expect(init?.headers).toBeUndefined()
      expect(init?.body).toBeUndefined()
      const html = new Response('<html>private</html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
      Object.defineProperty(html, 'url', { value: 'https://example.com/api/me?market=US' })
      return html
    })

    await expect(new TargetClient(adapter, fetcher).executeHtmlSession('CHECK_LOGIN', { market: 'US' }))
      .resolves.toEqual({ status: 200, contentType: 'text/html; charset=utf-8', finalPathname: '/api/me' })
    expect(fetcher.mock.results[0]?.value).toBeDefined()
  })

  it('constructs JSON POST requests without allowing arbitrary URLs', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.com/api/me?market=US')
      expect(init?.method).toBe('POST')
      expect(init?.credentials).toBe('include')
      expect(init?.headers).toEqual({ 'content-type': 'application/json' })
      expect(init?.body).toBe('{"safe":true}')
      return response({ authenticated: true })
    })
    const postAdapter = createTargetAdapter({
      targetId: 'post-example', displayName: 'Post Example', origin: 'https://example.com',
      operations: {
        ...adapter.operations,
        CHECK_LOGIN: { ...adapter.operations.CHECK_LOGIN, method: 'POST' },
      },
    })

    await expect(new TargetClient(postAdapter, fetcher).executeJsonPost(
      'CHECK_LOGIN', { market: 'US' }, { safe: true },
      async (result) => ({ loggedIn: (await result.json()).authenticated === true }),
    )).resolves.toEqual({ loggedIn: true })
  })

  it('rejects HTML responses that leave the adapter origin', async () => {
    const fetcher = vi.fn(async () => {
      const html = new Response('<html>private</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
      Object.defineProperty(html, 'url', { value: 'https://attacker.example/landing' })
      return html
    })
    await expect(new TargetClient(adapter, fetcher).executeHtmlSession('CHECK_LOGIN'))
      .rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })
  })
  it('maps unauthenticated, rate-limited, and malformed responses', async () => {
    const unauthenticated = new TargetClient(adapter, async () => response({}, { status: 401 }))
    await expect(unauthenticated.checkLogin()).resolves.toEqual({ loggedIn: false })

    const rateLimited = new TargetClient(adapter, async () => response({}, { status: 429 }))
    await expect(rateLimited.checkLogin()).rejects.toMatchObject({ code: 'TARGET_RATE_LIMITED' })

    const malformed = new TargetClient(adapter, async () => response({ user: {} }))
    await expect(malformed.checkLogin()).rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })
  })

  it('validates and minimizes profile responses', async () => {
    const fetcher = vi.fn(async () => response({
      userId: 'user-1',
      displayName: 'Example User',
      cookie: 'must-not-leak',
      token: 'must-not-leak',
    }))
    await expect(new TargetClient(adapter, fetcher).getProfile()).resolves.toEqual({
      userId: 'user-1',
      displayName: 'Example User',
    })

    const malformed = new TargetClient(adapter, async () => response({ userId: '', displayName: 'User' }))
    await expect(malformed.getProfile()).rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })
  })

  it('maps rejected fetches and timeout aborts', async () => {
    const network = new TargetClient(adapter, async () => { throw new Error('offline') })
    await expect(network.checkLogin()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })

    vi.useFakeTimers()
    const timeoutAdapter = createTargetAdapter({
      targetId: 'slow', displayName: 'Slow', origin: 'https://slow.example',
      operations: {
        ...adapter.operations,
        CHECK_LOGIN: { ...adapter.operations.CHECK_LOGIN, timeoutMs: 100, path: '/api/me' },
      },
    })
    const slow = new TargetClient(timeoutAdapter, (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const pending = slow.checkLogin()
    const timeoutAssertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(100)
    await timeoutAssertion
    vi.useRealTimers()
  })
})