import type { ProtocolErrorCode } from '@cookie-amazon/protocol'
import type { TargetAdapter, TargetProfile } from './adapter'
import {
  resolveOperationPolicy,
  type TargetOperation,
  type TargetOperationOverrides,
} from './policy'

export type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export class TargetClientError extends Error {
  public readonly code: ProtocolErrorCode
  public readonly status?: number
  public readonly targetCode?: string | number
  public readonly targetMessage?: string

  public constructor(
    code: ProtocolErrorCode,
    status?: number,
    details: { targetCode?: string | number; targetMessage?: string } = {},
  ) {
    super(details.targetMessage ?? code)
    this.name = 'TargetClientError'
    this.code = code
    this.status = status
    this.targetCode = details.targetCode
    this.targetMessage = details.targetMessage
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isLoggedInResponse = (value: unknown): value is { loggedIn?: boolean; authenticated?: boolean } => {
  if (!isRecord(value)) return false
  return typeof value.loggedIn === 'boolean' || typeof value.authenticated === 'boolean'
}

const readLoginStatus = async (response: Response): Promise<{ loggedIn: boolean }> => {
  if (response.status === 401) return { loggedIn: false }
  if (response.status === 429) throw new TargetClientError('TARGET_RATE_LIMITED', response.status)
  if (!response.ok) throw new TargetClientError('TARGET_API_ERROR', response.status)
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  if (!isLoggedInResponse(body)) throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  return { loggedIn: body.loggedIn ?? body.authenticated ?? false }
}

const readHtmlLoginProbe = async (
  response: Response,
  requestUrl: URL,
): Promise<{ loggedIn: boolean }> => {
  if (response.status === 401 || response.status === 403) return { loggedIn: false }
  if (response.status === 429) throw new TargetClientError('TARGET_RATE_LIMITED', response.status)
  if (!response.ok) throw new TargetClientError('TARGET_API_ERROR', response.status)

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('text/html') && !contentType.includes('json')) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }

  if (contentType.includes('json')) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
    }
    if (!isRecord(body)) throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
    const normalizedCode = typeof body.code === 'string' || typeof body.code === 'number'
      ? String(body.code).trim().toUpperCase()
      : ''
    const message = typeof body.message === 'string' ? body.message : ''
    if (['2', 'ERR_GLOBAL_SESSION_EXPIRED', 'UNAUTHORIZED', 'NOT_LOGGED_IN', 'LOGIN_REQUIRED'].includes(normalizedCode)
      || body.loggedIn === false || body.authenticated === false
      || /(?:未登录|登录(?:状态)?(?:已)?失效|会话(?:已)?(?:失效|过期)|请(?:重新|先)?登录|其他设备.*登录)/i.test(message)) {
      return { loggedIn: false }
    }
    if (typeof body.loggedIn === 'boolean' || typeof body.authenticated === 'boolean') {
      return { loggedIn: typeof body.loggedIn === 'boolean' ? body.loggedIn : body.authenticated === true }
    }
    if (body.code === 'OK' || body.code === 0 || body.code === 1 || body.code === '1' || body.code === 200) {
      return { loggedIn: true }
    }
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }

  let finalUrl: URL
  try {
    finalUrl = new URL(response.url)
  } catch {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  if (finalUrl.origin !== requestUrl.origin || finalUrl.username || finalUrl.password) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  if (/\/(?:user\/)?(?:login|signin)(?:\/|$)/i.test(finalUrl.pathname)) return { loggedIn: false }

  const body = await response.text()
  const looksLikeLoginPage = /<form\b[^>]*(?:action=["'][^"']*\/(?:user\/)?login|id=["'][^"']*login)/i.test(body)
    || /(?:请先登录|重新登录|登录已失效|账号密码登录)/i.test(body.replace(/<[^>]+>/g, ' ').slice(0, 20_000))
  if (looksLikeLoginPage) return { loggedIn: false }
  throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
}

const readProfile = async (response: Response): Promise<TargetProfile> => {
  if (response.status === 401) throw new TargetClientError('TARGET_NOT_LOGGED_IN', response.status)
  if (response.status === 429) throw new TargetClientError('TARGET_RATE_LIMITED', response.status)
  if (!response.ok) throw new TargetClientError('TARGET_API_ERROR', response.status)
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  if (!isRecord(body)) throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  const userId = typeof body.userId === 'string' ? body.userId : body.id
  const displayName = typeof body.displayName === 'string' ? body.displayName : body.name
  if (typeof userId !== 'string' || userId.length === 0 || userId.length > 256
    || typeof displayName !== 'string' || displayName.length === 0 || displayName.length > 256) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  return { userId, displayName }
}

export type HtmlSessionMetadata = {
  status: number
  contentType: string
  finalPathname: string
}

const readHtmlSessionMetadata = async (
  response: Response,
  requestUrl: URL,
): Promise<HtmlSessionMetadata> => {
  if (response.status === 401 || response.status === 403) {
    throw new TargetClientError('TARGET_NOT_LOGGED_IN', response.status)
  }
  if (response.status === 429) throw new TargetClientError('TARGET_RATE_LIMITED', response.status)
  if (!response.ok) throw new TargetClientError('TARGET_API_ERROR', response.status)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('text/html')) throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  let finalUrl: URL
  try {
    finalUrl = new URL(response.url)
  } catch {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  if (finalUrl.origin !== requestUrl.origin || finalUrl.username || finalUrl.password) {
    throw new TargetClientError('TARGET_RESPONSE_INVALID', response.status)
  }
  if (/\/(?:user\/)?(?:login|signin)(?:\/|$)/i.test(finalUrl.pathname)) {
    throw new TargetClientError('TARGET_NOT_LOGGED_IN', response.status, {
      targetMessage: 'SellerSprite 登录已失效，账号可能已在其他设备登录，请重新登录。',
    })
  }
  return { status: response.status, contentType, finalPathname: finalUrl.pathname }
}

export class TargetClient {
  private readonly fetcher: FetchImplementation

  public constructor(
    private readonly adapter: TargetAdapter,
    fetcher: FetchImplementation = (input, init) => fetch(input, init),
    private readonly operationOverrides: TargetOperationOverrides = {},
  ) {
    this.fetcher = fetcher
  }

  public async checkLogin(): Promise<{ loggedIn: boolean }> {
    return this.adapter.checkLogin(this)
  }

  public async executeLoginCheck(): Promise<{ loggedIn: boolean }> {
    return this.execute('CHECK_LOGIN', readLoginStatus)
  }

  public async executeHtmlLoginProbe(): Promise<{ loggedIn: boolean }> {
    return this.execute('CHECK_LOGIN', readHtmlLoginProbe)
  }

  public async getProfile(): Promise<TargetProfile> {
    return this.adapter.getProfile(this)
  }

  public async executeGetProfile(): Promise<TargetProfile> {
    return this.execute('GET_PROFILE', readProfile)
  }

  public async executeJsonGet<T>(
    operation: TargetOperation,
    query: Readonly<Record<string, string>>,
    parse: (response: Response) => Promise<T>,
  ): Promise<T> {
    return this.execute(operation, (response) => parse(response), { query })
  }

  public async executeJsonPost<T>(
    operation: TargetOperation,
    query: Readonly<Record<string, string>>,
    body: unknown,
    parse: (response: Response) => Promise<T>,
  ): Promise<T> {
    return this.execute(
      operation,
      (response) => parse(response),
      { query, body: { kind: 'json', value: body } },
    )
  }

  public async executeFormPost<T>(
    operation: TargetOperation,
    form: Readonly<Record<string, string>>,
    parse: (response: Response) => Promise<T>,
  ): Promise<T> {
    return this.execute(operation, (response) => parse(response), {
      query: {},
      body: { kind: 'form', value: form },
    })
  }

  public async executeHtmlSession(
    operation: TargetOperation,
    query: Readonly<Record<string, string>> = {},
    form?: Readonly<Record<string, string>>,
  ): Promise<HtmlSessionMetadata> {
    return this.execute(operation, readHtmlSessionMetadata, {
      query,
      ...(form === undefined ? {} : { body: { kind: 'form', value: form } as const }),
    })
  }

  private async execute<T>(
    operation: TargetOperation,
    parse: (response: Response, requestUrl: URL) => Promise<T>,
    request?: {
      query: Readonly<Record<string, string>>
      body?:
        | { kind: 'json'; value: unknown }
        | { kind: 'form'; value: Readonly<Record<string, string>> }
    },
  ): Promise<T> {
    const policy = resolveOperationPolicy(this.adapter.operations, operation, this.operationOverrides)
    if (!policy) throw new TargetClientError('TARGET_OPERATION_UNKNOWN')
    if (!policy.enabled) throw new TargetClientError('OPERATION_DISABLED')

    const url = new URL(policy.path, this.adapter.origin)
    if (url.origin !== this.adapter.origin || url.username || url.password) {
      throw new TargetClientError('TARGET_RESPONSE_INVALID')
    }
    if (request) {
      if (policy.method !== 'GET' && policy.method !== 'POST') {
        throw new TargetClientError('TARGET_OPERATION_UNKNOWN')
      }
      for (const [key, value] of Object.entries(request.query)) url.searchParams.set(key, value)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs)
    try {
      const response = await this.fetcher(url, {
        method: policy.method,
        credentials: 'include',
        signal: controller.signal,
        ...(request?.body === undefined
          ? {}
          : request.body.kind === 'json'
            ? {
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(request.body.value),
              }
            : {
                headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                body: new URLSearchParams(request.body.value),
              }),
      })
      return await parse(response, url)
    } catch (error: unknown) {
      if (error instanceof TargetClientError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TargetClientError('TIMEOUT')
      }
      throw new TargetClientError('NETWORK_ERROR')
    } finally {
      clearTimeout(timeout)
    }
  }
}