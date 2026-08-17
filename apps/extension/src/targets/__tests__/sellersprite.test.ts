import { describe, expect, it, vi } from 'vitest'
import { TargetClient } from '../client'
import { TARGET_REGISTRY } from '../registry'
import { SELLERSPRITE_ADAPTER } from '../sellersprite'

const htmlResponse = (
  url: string,
  init: ResponseInit = {},
): Response => {
  const response = new Response('<html>private content must not be read</html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

describe('SellerSprite session adapter', () => {
  it('is statically registered with the exact optional origin and login endpoint', () => {
    expect(TARGET_REGISTRY.get('sellersprite')).toBe(SELLERSPRITE_ADAPTER)
    expect(SELLERSPRITE_ADAPTER.origin).toBe('https://www.sellersprite.com')
    expect(SELLERSPRITE_ADAPTER.permissionOrigins).toEqual(['https://www.sellersprite.com/*'])
    expect(SELLERSPRITE_ADAPTER.operations.CHECK_LOGIN).toEqual({
      enabled: true,
      path: '/v2/me',
      method: 'GET',
      timeoutMs: 8_000,
      response: 'html-login-probe',
    })
    expect(SELLERSPRITE_ADAPTER.operations.GET_PROFILE.enabled).toBe(false)
  })

  it('uses browser-managed credentials without accepting headers or reading HTML', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://www.sellersprite.com/v2/me')
      expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
      expect(init?.headers).toBeUndefined()
      expect(init?.body).toBeUndefined()
      return htmlResponse('https://www.sellersprite.com/v2/me')
    })

    await expect(new TargetClient(SELLERSPRITE_ADAPTER, fetcher).checkLogin()).resolves.toEqual({ loggedIn: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('maps same-origin redirects and unauthenticated statuses to logged out', async () => {
    const redirected = new TargetClient(
      SELLERSPRITE_ADAPTER,
      async () => htmlResponse('https://www.sellersprite.com/login'),
    )
    await expect(redirected.checkLogin()).resolves.toEqual({ loggedIn: false })

    const unauthorized = new TargetClient(
      SELLERSPRITE_ADAPTER,
      async () => htmlResponse('https://www.sellersprite.com/v2/me', { status: 401 }),
    )
    await expect(unauthorized.checkLogin()).resolves.toEqual({ loggedIn: false })
  })

  it('rejects foreign redirects, non-HTML responses, and profile access', async () => {
    const foreignRedirect = new TargetClient(
      SELLERSPRITE_ADAPTER,
      async () => htmlResponse('https://attacker.example/login'),
    )
    await expect(foreignRedirect.checkLogin()).rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })

    const jsonResponse = new TargetClient(SELLERSPRITE_ADAPTER, async () => {
      const response = new Response(JSON.stringify({ user: 'private' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
      Object.defineProperty(response, 'url', { value: 'https://www.sellersprite.com/v2/me' })
      return response
    })
    await expect(jsonResponse.checkLogin()).rejects.toMatchObject({ code: 'TARGET_RESPONSE_INVALID' })
    await expect(SELLERSPRITE_ADAPTER.getProfile(jsonResponse)).rejects.toMatchObject({ code: 'OPERATION_DISABLED' })
  })
})