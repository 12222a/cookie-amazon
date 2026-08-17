import type { ProtocolErrorCode } from '@cookie-amazon/protocol'
import type { TargetAdapter } from './adapter'
import {
  resolveOperationPolicy,
  type TargetOperation,
  type TargetOperationOverrides,
} from './policy'

export type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export class TargetClientError extends Error {
  public readonly code: ProtocolErrorCode
  public readonly status?: number

  public constructor(code: ProtocolErrorCode, status?: number) {
    super(code)
    this.name = 'TargetClientError'
    this.code = code
    this.status = status
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

  private async execute<T>(
    operation: TargetOperation,
    parse: (response: Response) => Promise<T>,
  ): Promise<T> {
    const policy = resolveOperationPolicy(this.adapter.operations, operation, this.operationOverrides)
    if (!policy) throw new TargetClientError('TARGET_OPERATION_UNKNOWN')
    if (!policy.enabled) throw new TargetClientError('OPERATION_DISABLED')

    const url = new URL(policy.path, this.adapter.origin)
    if (url.origin !== this.adapter.origin || url.username || url.password) {
      throw new TargetClientError('TARGET_RESPONSE_INVALID')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs)
    try {
      const response = await this.fetcher(url, {
        method: policy.method,
        credentials: 'include',
        signal: controller.signal,
      })
      return await parse(response)
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