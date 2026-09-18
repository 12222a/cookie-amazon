import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TargetAdapter } from '../targets/adapter'
import { SELLERSPRITE_ADAPTER } from '../targets/sellersprite'
import { resolveRuntimeTargetPolicy } from '../targets/runtime-policy'
import { checkSellerSpriteConnection } from './sellersprite-session'

type PageProbeMode = boolean | 'execute'
type PageProbeInjection = {
  func: (url: string, browserDetectedSession: boolean, timeoutMs: number) => Promise<{
    loggedIn: boolean
    definitive: boolean
  }>
  args: [string, boolean, number]
}

const mockBrowser = (pageProbeMode: PageProbeMode, cookieFound = true) => {
  const executeScript = vi.fn(async (injection: unknown) => {
    if (pageProbeMode === 'execute') {
      const pageProbe = injection as PageProbeInjection
      return [{ result: await pageProbe.func(...pageProbe.args) }]
    }
    return [{ result: { loggedIn: pageProbeMode, definitive: true } }]
  })
  vi.stubGlobal('browser', {
    cookies: {
      getAll: vi.fn().mockResolvedValue(cookieFound ? [{
        name: 'Sprite-X-Token', value: 'authenticated-token',
      }] : []),
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{
        id: 7, active: true, lastAccessed: 100, status: 'complete',
      }]),
      get: vi.fn().mockResolvedValue({ id: 7, status: 'complete' }),
      create: vi.fn(),
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    scripting: { executeScript },
  })
  return { executeScript }
}

const adapterWithBackgroundLogin = (loggedIn: boolean): TargetAdapter => ({
  ...SELLERSPRITE_ADAPTER,
  checkLogin: vi.fn().mockResolvedValue({ loggedIn }),
})

const pageResponse = (
  body: string,
  contentType: string,
  url = 'https://www.sellersprite.com/v3/api/client',
  status = 200,
): Response => {
  const response = new Response(body, { status, headers: { 'content-type': contentType } })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SellerSprite connection session', () => {
  it('confirms a negative service-worker probe in the authenticated page context', async () => {
    const { executeScript } = mockBrowser(true)
    const adapter = adapterWithBackgroundLogin(false)

    await expect(checkSellerSpriteConnection(
      adapter,
      resolveRuntimeTargetPolicy(adapter, null),
    )).resolves.toEqual({
      targetId: 'sellersprite',
      loggedIn: true,
      connectionState: 'PAGE_CONTEXT_OK',
      connectionMode: 'page',
      cookieFound: true,
    })
    expect(executeScript).toHaveBeenCalledTimes(1)
  })

  it('reports logged out only after the first-party page probe also rejects the session', async () => {
    mockBrowser(false)
    const adapter = adapterWithBackgroundLogin(false)

    await expect(checkSellerSpriteConnection(
      adapter,
      resolveRuntimeTargetPolicy(adapter, null),
    )).resolves.toMatchObject({
      loggedIn: false,
      connectionState: 'NEED_LOGIN',
      connectionMode: 'page',
      cookieFound: true,
    })
  })

  it('does not trust a stale cookie when the protected endpoint unexpectedly returns HTML', async () => {
    mockBrowser('execute')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pageResponse(
      '<html>stale cached account shell</html>',
      'text/html; charset=utf-8',
    )))
    const adapter = adapterWithBackgroundLogin(false)

    await expect(checkSellerSpriteConnection(
      adapter,
      resolveRuntimeTargetPolicy(adapter, null),
    )).resolves.toMatchObject({
      loggedIn: false,
      connectionState: 'PAGE_CONTEXT_FAILED',
      connectionMode: 'page',
      cookieFound: true,
    })
  })

  it('accepts the verified SellerSprite client session envelope in first-party context', async () => {
    mockBrowser('execute')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pageResponse(
      JSON.stringify({ code: 'OK', message: '成功', data: { id: 1 }, success: true }),
      'application/json',
    )))
    const adapter = adapterWithBackgroundLogin(false)

    await expect(checkSellerSpriteConnection(
      adapter,
      resolveRuntimeTargetPolicy(adapter, null),
    )).resolves.toMatchObject({
      loggedIn: true,
      connectionState: 'PAGE_CONTEXT_OK',
      connectionMode: 'page',
      cookieFound: true,
    })
  })

  it('treats SellerSprite code 2 as an explicitly logged-out session', async () => {
    mockBrowser('execute')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pageResponse(
      JSON.stringify({ code: 2, message: '您当前未登录' }),
      'application/json',
    )))
    const adapter = adapterWithBackgroundLogin(false)

    await expect(checkSellerSpriteConnection(
      adapter,
      resolveRuntimeTargetPolicy(adapter, null),
    )).resolves.toMatchObject({
      loggedIn: false,
      connectionState: 'NEED_LOGIN',
      connectionMode: 'page',
      cookieFound: true,
    })
  })

  it('does not treat a stale cookie plus unknown JSON as an authenticated session', async () => {
    mockBrowser('execute')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pageResponse(
      JSON.stringify({ user: 'unknown-shape' }),
      'application/json',
    )))
    const adapter = adapterWithBackgroundLogin(false)

    await expect(checkSellerSpriteConnection(
      adapter,
      resolveRuntimeTargetPolicy(adapter, null),
    )).resolves.toMatchObject({
      loggedIn: false,
      connectionState: 'PAGE_CONTEXT_FAILED',
      connectionMode: 'page',
      cookieFound: true,
    })
  })

  it('reports an explicitly expired first-party session as logged out', async () => {
    mockBrowser('execute')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pageResponse(
      JSON.stringify({ code: 'ERR_GLOBAL_SESSION_EXPIRED' }),
      'application/json',
    )))
    const adapter = adapterWithBackgroundLogin(false)

    await expect(checkSellerSpriteConnection(
      adapter,
      resolveRuntimeTargetPolicy(adapter, null),
    )).resolves.toMatchObject({
      loggedIn: false,
      connectionState: 'NEED_LOGIN',
      connectionMode: 'page',
      cookieFound: true,
    })
  })

  it('reports a login redirect as logged out even when an old cookie remains', async () => {
    mockBrowser('execute')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pageResponse(
      '<html>login</html>',
      'text/html',
      'https://www.sellersprite.com/login',
    )))
    const adapter = adapterWithBackgroundLogin(false)

    await expect(checkSellerSpriteConnection(
      adapter,
      resolveRuntimeTargetPolicy(adapter, null),
    )).resolves.toMatchObject({
      loggedIn: false,
      connectionState: 'NEED_LOGIN',
      cookieFound: true,
    })
  })

  it('uses the first-party session endpoint when the cookie API reports no cookies', async () => {
    const { executeScript } = mockBrowser(true, false)
    const adapter = adapterWithBackgroundLogin(false)

    await expect(checkSellerSpriteConnection(
      adapter,
      resolveRuntimeTargetPolicy(adapter, null),
    )).resolves.toEqual({
      targetId: 'sellersprite',
      loggedIn: true,
      connectionState: 'PAGE_CONTEXT_OK',
      connectionMode: 'page',
      cookieFound: false,
    })
    expect(executeScript).toHaveBeenCalledTimes(1)
    expect(adapter.checkLogin).toHaveBeenCalledTimes(1)
  })

  it('passes the configured login timeout into the first-party page probe', async () => {
    const { executeScript } = mockBrowser(false)
    const adapter = adapterWithBackgroundLogin(false)

    await checkSellerSpriteConnection(adapter, resolveRuntimeTargetPolicy(adapter, null))

    const injection = executeScript.mock.calls[0]?.[0] as PageProbeInjection
    expect(injection.args).toEqual(['https://www.sellersprite.com/v3/api/client', true, 8_000])
  })

  it('keeps a positive background result without opening a page probe', async () => {
    const { executeScript } = mockBrowser(true)
    const adapter = adapterWithBackgroundLogin(true)

    await expect(checkSellerSpriteConnection(
      adapter,
      resolveRuntimeTargetPolicy(adapter, null),
    )).resolves.toMatchObject({
      loggedIn: true,
      connectionState: 'BACKGROUND_OK',
      connectionMode: 'background',
    })
    expect(executeScript).not.toHaveBeenCalled()
  })
})