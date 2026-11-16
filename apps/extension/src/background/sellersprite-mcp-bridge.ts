import {
  KEYWORD_PRODUCT_RESEARCH_ACTION,
  MARKET_SELECTION_ACTION,
  isPingRequest,
  isSellerSpriteAbaPeriodsRequest,
  isSellerSpriteAbaResearchRequest,
  isSellerSpriteAdsRequest,
  isSellerSpriteCategoryNodesRequest,
  isSellerSpriteCompetitorRequest,
  isSellerSpriteHtmlSessionRequest,
  isSellerSpriteKeywordMiningRequest,
  isSellerSpriteKeywordReverseRequest,
  isSellerSpriteMarketResearchRequest,
  isSellerSpriteMonthlyRequest,
  isSellerSpriteProductSelectionRequest,
  isSellerSpriteReviewCommentsRequest,
  isTargetRequest,
  type ProtocolError,
} from '@cookie-amazon/protocol'

export const SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY = 'sellerSpriteMcpBridgeToken'
export const SELLERSPRITE_MCP_BRIDGE_STATE_KEY = 'sellerSpriteMcpBridgeState'
export const SELLERSPRITE_MCP_BRIDGE_ORIGIN = 'http://127.0.0.1:32123'
export const SELLERSPRITE_MCP_BRIDGE_ALARM = 'sellersprite-mcp-reconnect'

export type SellerSpriteMcpBridgeState = {
  status: 'unconfigured' | 'connecting' | 'connected' | 'waiting-for-service' | 'authentication-error'
  updatedAt: number
}

type BridgeJob = { requestId: string; request: unknown }
type BridgeStorage = {
  get(key: string): Promise<Record<string, unknown>>
  set(values: Record<string, unknown>): Promise<void>
}
type BridgeFetch = (input: string, init: RequestInit) => Promise<Response>
type BridgeHandler = (request: unknown) => Promise<unknown>
type BridgeSession = { pending?: { requestId: string; result: Promise<unknown> } }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isAllowedSellerSpriteMcpRequest = (request: unknown): boolean => {
  if (isPingRequest(request)) return true
  if (isTargetRequest(request)) {
    return request.payload?.targetId === 'sellersprite'
      && (request.action === 'CHECK_LOGIN' || request.action === 'GET_TARGET_STATUS')
  }
  if (!isRecord(request) || !isRecord(request.payload) || request.payload.targetId !== 'sellersprite') return false
  return isSellerSpriteKeywordReverseRequest(request)
    || isSellerSpriteMonthlyRequest(request)
    || isSellerSpriteMarketResearchRequest(request)
    || isSellerSpriteAbaPeriodsRequest(request)
    || isSellerSpriteAbaResearchRequest(request)
    || isSellerSpriteAdsRequest(request)
    || isSellerSpriteCompetitorRequest(request)
    || isSellerSpriteProductSelectionRequest(request)
    || isSellerSpriteCategoryNodesRequest(request)
    || isSellerSpriteReviewCommentsRequest(request)
    || isSellerSpriteKeywordMiningRequest(request)
    || (isSellerSpriteHtmlSessionRequest(request)
      && (request.action === MARKET_SELECTION_ACTION || request.action === KEYWORD_PRODUCT_RESEARCH_ACTION))
}

const deniedResponse = (request: unknown): ProtocolError => ({
  namespace: 'cookie-amazon-platform',
  kind: 'response',
  protocolVersion: 1,
  requestId: isRecord(request) && typeof request.requestId === 'string' ? request.requestId : 'unknown',
  ok: false,
  error: { code: 'UNKNOWN_ACTION' },
})

export const handleSellerSpriteMcpJob = async (
  job: BridgeJob,
  handleRequest: BridgeHandler,
): Promise<unknown> => {
  if (!isRecord(job) || typeof job.requestId !== 'string' || !isAllowedSellerSpriteMcpRequest(job.request)
    || !isRecord(job.request) || job.request.requestId !== job.requestId) {
    return deniedResponse(isRecord(job) ? job.request : undefined)
  }
  try {
    return await handleRequest(job.request)
  } catch {
    return { ...deniedResponse(job.request), error: { code: 'TARGET_API_ERROR' } } satisfies ProtocolError
  }
}

const delay = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const finish = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    signal.removeEventListener('abort', finish)
    resolve()
  }
  signal.addEventListener('abort', finish, { once: true })
  if (signal.aborted) finish()
  else timer = setTimeout(finish, ms)
})

export const startSellerSpriteMcpBridge = (
  handleRequest: BridgeHandler,
  options: { storage?: BridgeStorage; fetch?: BridgeFetch; session?: BridgeSession } = {},
): AbortController => {
  const controller = new AbortController()
  const storage = options.storage ?? browser.storage.local
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init))
  const session = options.session ?? {}
  let state: SellerSpriteMcpBridgeState | undefined
  const report = async (status: SellerSpriteMcpBridgeState['status']): Promise<void> => {
    if (controller.signal.aborted) return
    const updatedAt = Date.now()
    if (state?.status === status && updatedAt - state.updatedAt < 15_000) return
    state = { status, updatedAt }
    try {
      await storage.set({ [SELLERSPRITE_MCP_BRIDGE_STATE_KEY]: state })
    } catch {
      // Status persistence must not prevent an authenticated MCP request.
    }
  }
  const httpFailure = async (status: number): Promise<void> => {
    await report(status === 401 || status === 403 ? 'authentication-error' : 'waiting-for-service')
    await delay(status === 401 || status === 403 ? 30_000 : 2000, controller.signal)
  }
  const request = (path: '/poll' | '/result', headers: Record<string, string>, body: string): Promise<Response> =>
    fetcher(SELLERSPRITE_MCP_BRIDGE_ORIGIN + '/v1/bridge' + path, {
      method: 'POST', headers, body,
      // A pending localhost request must finish before Chrome's 30-second fetch limit.
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
    })
  const poll = async (): Promise<void> => {
    try {
      while (!controller.signal.aborted) {
        try {
          const values = await storage.get(SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY)
          if (controller.signal.aborted) return
          const token = values[SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY]
          if (typeof token !== 'string' || token.length < 32) {
            await report('unconfigured')
            return
          }
          if (!state) await report('connecting')
          const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' }
          const pending = session.pending
          if (pending) {
            const result = await pending.result
            if (controller.signal.aborted) return
            const accepted = await request('/result', headers, JSON.stringify({ requestId: pending.requestId, response: result }))
            if (controller.signal.aborted) return
            // An expired request or invalid payload cannot be recovered by retrying it.
            if (accepted.ok || [400, 404, 413].includes(accepted.status)) delete session.pending
            if (accepted.ok) await report('connected')
            else await httpFailure(accepted.status)
            continue
          }
          const response = await request('/poll', headers, '{}')
          if (!response.ok) {
            await httpFailure(response.status)
            continue
          }
          const value: unknown = await response.json()
          if (!isRecord(value) || !Object.hasOwn(value, 'request')) throw new Error('INVALID_BRIDGE_RESPONSE')
          await report('connected')
          if (controller.signal.aborted) return
          if (value.request === null || value.request === undefined || typeof value.requestId !== 'string') continue
          session.pending = {
            requestId: value.requestId,
            result: handleSellerSpriteMcpJob({ requestId: value.requestId, request: value.request }, handleRequest),
          }
        } catch {
          if (!controller.signal.aborted) {
            await report('waiting-for-service')
            await delay(2000, controller.signal)
          }
        }
      }
    } finally {
      controller.abort()
    }
  }
  void poll()
  return controller
}

export const installSellerSpriteMcpBridge = (handleRequest: BridgeHandler): (() => void) => {
  let bridge: AbortController | undefined
  // ponytail: Keep one job across reconnects; a destroyed worker uses the server's existing lease to recover.
  const session: BridgeSession = {}
  const connect = (): void => {
    if (!bridge || bridge.signal.aborted) bridge = startSellerSpriteMcpBridge(handleRequest, { session })
  }
  const wake = (): void => {
    void browser.alarms.create(SELLERSPRITE_MCP_BRIDGE_ALARM, { periodInMinutes: 0.5 })
    connect()
  }
  const onAlarm = (alarm: { name: string }): void => {
    if (alarm.name === SELLERSPRITE_MCP_BRIDGE_ALARM) connect()
  }
  const onStorageChanged = (changes: Record<string, unknown>, areaName: string): void => {
    if (areaName !== 'local' || !Object.hasOwn(changes, SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY)) return
    bridge?.abort()
    connect()
  }
  // Listeners are installed synchronously so Chrome can wake a suspended worker.
  browser.runtime.onInstalled.addListener(wake)
  browser.runtime.onStartup.addListener(wake)
  browser.alarms.onAlarm.addListener(onAlarm)
  browser.storage.onChanged.addListener(onStorageChanged)
  wake()
  return () => {
    bridge?.abort()
    browser.runtime.onInstalled.removeListener(wake)
    browser.runtime.onStartup.removeListener(wake)
    browser.alarms.onAlarm.removeListener(onAlarm)
    browser.storage.onChanged.removeListener(onStorageChanged)
    void browser.alarms.clear(SELLERSPRITE_MCP_BRIDGE_ALARM)
  }
}
