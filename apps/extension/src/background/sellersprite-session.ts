import type {
  TargetConnectionMode,
  TargetConnectionState,
  TargetDescriptor,
  TargetLoginData,
} from '@cookie-amazon/protocol'
import type { TargetAdapter } from '../targets/adapter'
import { TargetClient, TargetClientError, type FetchImplementation } from '../targets/client'
import { resolveOperationPolicy } from '../targets/policy'
import type { RuntimeTargetPolicy } from '../targets/runtime-policy'
import { isSellerSpriteAuthenticatedCookie } from '../targets/sellersprite'

type PageLoginProbe = { loggedIn: boolean; definitive: boolean }
type PageFetchResult = {
  status: number
  statusText: string
  url: string
  headers: [string, string][]
  body: string
}

const hasSellerSpriteCookie = async (adapter: TargetDescriptor): Promise<boolean> => {
  const originUrl = new URL(adapter.origin)
  const [urlCookies, domainCookies] = await Promise.all([
    browser.cookies.getAll({ url: originUrl.toString() }),
    browser.cookies.getAll({ domain: originUrl.hostname }),
  ])
  return [...urlCookies, ...domainCookies].some((cookie) =>
    isSellerSpriteAuthenticatedCookie(cookie.name, cookie.value))
}

const waitForTab = async (tabId: number): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const cleanup = (): void => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      browser.tabs.onUpdated.removeListener(onUpdated)
    }
    const complete = (): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const fail = (error: TargetClientError): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onUpdated = (updatedTabId: number, changeInfo: { status?: string }): void => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') complete()
    }

    browser.tabs.onUpdated.addListener(onUpdated)
    timeoutId = setTimeout(() => fail(new TargetClientError('TIMEOUT')), 15_000)
    void browser.tabs.get(tabId)
      .then((tab) => { if (tab.status === 'complete') complete() })
      .catch(() => fail(new TargetClientError('EXTENSION_UNAVAILABLE')))
  })
}

const getSellerSpriteTab = async (adapter: TargetDescriptor): Promise<number> => {
  const tabs = await browser.tabs.query({ url: `${adapter.origin}/*` })
  const existing = tabs
    .filter((tab): tab is typeof tab & { id: number } => typeof tab.id === 'number')
    .sort((left, right) => {
      // Prefer the tab the user is currently viewing. A stale login tab can
      // otherwise be selected before the active authenticated SellerSprite tab.
      if (left.active !== right.active) return left.active ? -1 : 1
      return (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0)
    })[0]
  if (existing) {
    await waitForTab(existing.id)
    return existing.id
  }
  const created = await browser.tabs.create({ url: adapter.origin })
  if (typeof created.id !== 'number') throw new TargetClientError('EXTENSION_UNAVAILABLE')
  await waitForTab(created.id)
  return created.id
}

const executePageLoginProbe = async (
  tabId: number,
  probeUrl: string,
  authenticatedCookieFound: boolean,
  timeoutMs: number,
): Promise<PageLoginProbe> => {
  const results = await browser.scripting.executeScript({
    target: { tabId },
    func: async (
      url: string,
      browserDetectedSession: boolean,
      requestTimeoutMs: number,
    ): Promise<PageLoginProbe> => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs)
      try {
        const response = await fetch(url, {
          credentials: 'include',
          redirect: 'follow',
          signal: controller.signal,
        })
        const requestUrl = new URL(url)
        const finalUrl = new URL(response.url)
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
        void browserDetectedSession
        if (finalUrl.origin !== requestUrl.origin || finalUrl.username || finalUrl.password) {
          return { loggedIn: false, definitive: false }
        }
        if (response.status === 401 || response.status === 403) return { loggedIn: false, definitive: true }
        if (/\/(?:user\/)?(?:login|signin)(?:\/|$)/i.test(finalUrl.pathname)) {
          return { loggedIn: false, definitive: true }
        }
        if (!response.ok) return { loggedIn: false, definitive: false }
        if (contentType.includes('json')) {
          let body: unknown
          try {
            body = await response.json()
          } catch {
            return { loggedIn: false, definitive: false }
          }
          if (typeof body === 'object' && body !== null) {
            const record = body as { code?: unknown; message?: unknown; loggedIn?: unknown; authenticated?: unknown }
            const code = typeof record.code === 'string' || typeof record.code === 'number'
              ? String(record.code).trim().toUpperCase()
              : ''
            const message = typeof record.message === 'string' ? record.message : ''
            if (['2', 'ERR_GLOBAL_SESSION_EXPIRED', 'UNAUTHORIZED', 'NOT_LOGGED_IN', 'LOGIN_REQUIRED'].includes(code)
              || record.loggedIn === false || record.authenticated === false
              || /(?:未登录|登录(?:状态)?(?:已)?失效|会话(?:已)?(?:失效|过期)|请(?:重新|先)?登录|其他设备.*登录)/i.test(message)) {
              return { loggedIn: false, definitive: true }
            }
            if (typeof record.loggedIn === 'boolean' || typeof record.authenticated === 'boolean') {
              return { loggedIn: record.loggedIn === true || record.authenticated === true, definitive: true }
            }
            if (record.code === 'OK' || record.code === 0 || record.code === 1
              || record.code === '1' || record.code === 200) {
              return { loggedIn: true, definitive: true }
            }
          }
          return { loggedIn: false, definitive: false }
        }
        if (!contentType.includes('text/html')) return { loggedIn: false, definitive: false }
        const body = await response.text()
        const looksLikeLoginPage = /<form\b[^>]*(?:action=["'][^"']*\/(?:user\/)?login|id=["'][^"']*login)/i.test(body)
          || /(?:请先登录|重新登录|登录已失效|账号密码登录)/i.test(body.replace(/<[^>]+>/g, ' ').slice(0, 20_000))
        return { loggedIn: false, definitive: looksLikeLoginPage }
      } catch {
        return { loggedIn: false, definitive: false }
      } finally {
        clearTimeout(timeoutId)
      }
    },
    args: [probeUrl, authenticatedCookieFound, timeoutMs],
  })
  const result = results[0]?.result
  if (typeof result !== 'object' || result === null
    || typeof (result as PageLoginProbe).loggedIn !== 'boolean'
    || typeof (result as PageLoginProbe).definitive !== 'boolean') {
    throw new TargetClientError('TARGET_RESPONSE_INVALID')
  }
  if (!(result as PageLoginProbe).definitive) throw new TargetClientError('TARGET_RESPONSE_INVALID')
  return result as PageLoginProbe
}

const descriptorFor = (adapter: TargetAdapter, runtimePolicy: RuntimeTargetPolicy): TargetDescriptor => ({
  targetId: adapter.targetId,
  displayName: adapter.displayName,
  origin: adapter.origin,
  enabled: runtimePolicy.enabled,
  status: 'ready',
})

const createPageContextClient = async (
  adapter: TargetAdapter,
  runtimePolicy: RuntimeTargetPolicy,
): Promise<TargetClient> => {
  const tabId = await getSellerSpriteTab(descriptorFor(adapter, runtimePolicy))
  const fetcher: FetchImplementation = async (input, init) => {
    const requestUrl = String(input)
    const requestInit = {
      method: init?.method ?? 'GET',
      headers: Array.from(new Headers(init?.headers).entries()),
      body: typeof init?.body === 'string' ? init.body : init?.body === undefined ? undefined : String(init.body),
    }
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: async (url: string, request: { method: string; headers: [string, string][]; body?: string }): Promise<PageFetchResult> => {
        const response = await fetch(url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          credentials: 'include',
          redirect: 'follow',
        })
        return {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          headers: Array.from(response.headers.entries()),
          body: await response.text(),
        }
      },
      args: [requestUrl, requestInit],
    })
    const result = results[0]?.result
    if (typeof result !== 'object' || result === null || typeof (result as PageFetchResult).body !== 'string') {
      throw new TargetClientError('TARGET_RESPONSE_INVALID')
    }
    const pageResponse = result as PageFetchResult
    const response = new Response(pageResponse.body, {
      status: pageResponse.status,
      statusText: pageResponse.statusText,
      headers: pageResponse.headers,
    })
    Object.defineProperty(response, 'url', { value: pageResponse.url })
    return response
  }
  return new TargetClient(adapter, fetcher, runtimePolicy.operationOverrides)
}

export const withPageFallback = async <T>(
  adapter: TargetAdapter,
  runtimePolicy: RuntimeTargetPolicy,
  backgroundRequest: () => Promise<T>,
  pageRequest: (client: TargetClient) => Promise<T>,
): Promise<T> => {
  try {
    return await backgroundRequest()
  } catch (error: unknown) {
    if (!(error instanceof TargetClientError)) throw error
    return pageRequest(await createPageContextClient(adapter, runtimePolicy))
  }
}

const getConnectionResult = (
  targetId: string,
  loggedIn: boolean,
  connectionState: TargetConnectionState,
  connectionMode?: TargetConnectionMode,
  cookieFound?: boolean,
): TargetLoginData => ({
  targetId,
  loggedIn,
  connectionState,
  ...(connectionMode === undefined ? {} : { connectionMode }),
  ...(cookieFound === undefined ? {} : { cookieFound }),
})

export const checkSellerSpriteConnection = async (
  adapter: TargetAdapter,
  runtimePolicy: RuntimeTargetPolicy,
): Promise<TargetLoginData> => {
  const descriptor = descriptorFor(adapter, runtimePolicy)
  let cookieFound = false
  try {
    cookieFound = await hasSellerSpriteCookie(descriptor)
  } catch {
    cookieFound = false
  }

  // Chrome can report no cookies to an extension service worker even while the
  // first-party SellerSprite tab has a valid session. Treat cookie discovery as
  // diagnostic evidence only; the authenticated endpoint is the authority.
  const backgroundClient = new TargetClient(adapter, undefined, runtimePolicy.operationOverrides)
  try {
    const login = await adapter.checkLogin(backgroundClient)
    if (login.loggedIn) return getConnectionResult(adapter.targetId, true, 'BACKGROUND_OK', 'background', cookieFound)
    // An extension service worker is a cross-site request context. Chrome can
    // withhold SameSite session cookies there even though the SellerSprite tab
    // is authenticated, so a negative background response is not definitive.
    // Confirm it in the first-party page context before reporting NEED_LOGIN.
  } catch {
    // Fall back to a page-context check when direct authenticated requests fail.
  }

  const policy = resolveOperationPolicy(adapter.operations, 'CHECK_LOGIN', runtimePolicy.operationOverrides)
  if (!policy) return getConnectionResult(adapter.targetId, false, 'BACKGROUND_FAILED', undefined, cookieFound)

  try {
    const tabId = await getSellerSpriteTab(descriptor)
    const probeUrl = new URL(policy.path, adapter.origin).toString()
    const pageResult = await executePageLoginProbe(tabId, probeUrl, cookieFound, policy.timeoutMs)
    if (pageResult.loggedIn) return getConnectionResult(adapter.targetId, true, 'PAGE_CONTEXT_OK', 'page', cookieFound)
    return getConnectionResult(adapter.targetId, false, 'NEED_LOGIN', 'page', cookieFound)
  } catch {
    return getConnectionResult(adapter.targetId, false, 'PAGE_CONTEXT_FAILED', 'page', cookieFound)
  }
}