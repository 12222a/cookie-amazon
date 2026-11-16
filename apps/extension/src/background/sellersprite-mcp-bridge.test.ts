import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSellerSpriteMonthlyRequest, createTargetRequest, createPingRequest,
  createSellerSpriteAdsInsightsRequest, createSellerSpriteAdsHistoryRequest,
  createSellerSpriteAdsKeywordsRequest, createSellerSpriteAdsHighFrequencyRequest,
} from '@cookie-amazon/protocol'
import {
  handleSellerSpriteMcpJob,
  isAllowedSellerSpriteMcpRequest,
  installSellerSpriteMcpBridge,
  SELLERSPRITE_MCP_BRIDGE_ALARM,
  SELLERSPRITE_MCP_BRIDGE_STATE_KEY,
  SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY,
  startSellerSpriteMcpBridge,
} from './sellersprite-mcp-bridge.js'

const bridgeToken = 'test-token-with-at-least-32-characters-long'
const controllers: AbortController[] = []
const cleanups: (() => void)[] = []

const flush = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) await Promise.resolve()
}

const pendingPoll = (_input: string, init: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
  const abort = (): void => reject(new DOMException('Aborted', 'AbortError'))
  if (init.signal?.aborted) abort()
  else init.signal?.addEventListener('abort', abort, { once: true })
})

const storageFixture = (token: unknown = bridgeToken) => {
  const values: Record<string, unknown> = { [SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY]: token }
  return {
    values,
    get: vi.fn(async () => ({ ...values })),
    set: vi.fn(async (next: Record<string, unknown>) => { Object.assign(values, next) }),
  }
}

const eventFixture = <T extends unknown[]>() => {
  const listeners = new Set<(...args: T) => void>()
  return {
    addListener: (listener: (...args: T) => void) => { listeners.add(listener) },
    removeListener: (listener: (...args: T) => void) => { listeners.delete(listener) },
    emit: (...args: T) => { for (const listener of listeners) listener(...args) },
    listeners,
  }
}

const lifecycleFixture = (token: unknown = bridgeToken) => {
  const storage = storageFixture(token)
  const onStartup = eventFixture<[]>()
  const onInstalled = eventFixture<[]>()
  const onAlarm = eventFixture<[{ name: string }]>()
  const onChanged = eventFixture<[Record<string, unknown>, string]>()
  const alarms = { onAlarm, create: vi.fn(async () => {}), clear: vi.fn(async () => true) }
  vi.stubGlobal('browser', {
    runtime: { onStartup, onInstalled },
    storage: { local: storage, onChanged },
    alarms,
  })
  return { storage, onStartup, onInstalled, onAlarm, onChanged, alarms }
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  for (const controller of controllers.splice(0)) controller.abort()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SellerSprite MCP extension bridge', () => {
  it('does not poll until a bridge token is configured', async () => {
    const fetcher = vi.fn(async () => new Response('{}'))
    const controller = startSellerSpriteMcpBridge(async () => ({}), {
      storage: storageFixture(null),
      fetch: fetcher,
    })
    controllers.push(controller)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetcher).not.toHaveBeenCalled()
    expect(SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY).toBe('sellerSpriteMcpBridgeToken')
  })

  it('reports missing configuration and stops until a lifecycle event wakes it', async () => {
    const storage = storageFixture(null)
    const fetcher = vi.fn(pendingPoll)
    const controller = startSellerSpriteMcpBridge(async () => ({}), { storage, fetch: fetcher })
    controllers.push(controller)
    await flush()
    expect(fetcher).not.toHaveBeenCalled()
    expect(storage.values[SELLERSPRITE_MCP_BRIDGE_STATE_KEY]).toMatchObject({ status: 'unconfigured' })
    expect(controller.signal.aborted).toBe(true)
  })

  it('automatically retries when the local service becomes available and reports a real connection', async () => {
    vi.useFakeTimers()
    const storage = storageFixture()
    const fetcher = vi.fn(pendingPoll)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ request: null })))
    const controller = startSellerSpriteMcpBridge(async () => ({}), { storage, fetch: fetcher })
    controllers.push(controller)
    await flush()
    expect(storage.values[SELLERSPRITE_MCP_BRIDGE_STATE_KEY]).toMatchObject({ status: 'waiting-for-service' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(storage.values[SELLERSPRITE_MCP_BRIDGE_STATE_KEY]).toMatchObject({ status: 'connected' })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls[1]?.[1].headers).toMatchObject({ authorization: 'Bearer ' + bridgeToken })
  })

  it('distinguishes a rejected secret from a stopped local service', async () => {
    vi.useFakeTimers()
    const storage = storageFixture()
    const fetcher = vi.fn(pendingPoll).mockResolvedValueOnce(new Response('{}', { status: 401 }))
    controllers.push(startSellerSpriteMcpBridge(async () => ({}), { storage, fetch: fetcher }))
    await flush()
    expect(storage.values[SELLERSPRITE_MCP_BRIDGE_STATE_KEY]).toMatchObject({ status: 'authentication-error' })
    await vi.advanceTimersByTimeAsync(29_999)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([503, 429, 'network error'])('retries the same result after two seconds without rerunning the handler (%s)', async (failure) => {
    vi.useFakeTimers()
    const storage = storageFixture()
    const ping = createPingRequest('live-ping')
    const handler = vi.fn(async () => ({ ok: true }))
    const fetcher = vi.fn(pendingPoll)
      .mockResolvedValueOnce(new Response(JSON.stringify({ requestId: ping.requestId, request: ping })))
    if (typeof failure === 'number') fetcher.mockResolvedValueOnce(new Response('{}', { status: failure }))
    else fetcher.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetcher.mockResolvedValueOnce(new Response('{}'))
    controllers.push(startSellerSpriteMcpBridge(handler, { storage, fetch: fetcher }))
    await flush()
    expect(handler).toHaveBeenCalledWith(ping)
    expect(fetcher.mock.calls[1]?.[0]).toBe('http://127.0.0.1:32123/v1/bridge/result')
    const body = fetcher.mock.calls[1]?.[1].body
    expect(JSON.parse(body as string)).toEqual({ requestId: 'live-ping', response: { ok: true } })
    expect(storage.values[SELLERSPRITE_MCP_BRIDGE_STATE_KEY]).toMatchObject({ status: 'waiting-for-service' })
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher.mock.calls.map(([input]) => new URL(input).pathname)).toEqual([
      '/v1/bridge/poll', '/v1/bridge/result', '/v1/bridge/result', '/v1/bridge/poll',
    ])
    expect(fetcher.mock.calls[2]?.[1].body).toBe(body)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it.each([400, 404, 413])('continues polling for the next job after a terminal result rejection (%i)', async (status) => {
    vi.useFakeTimers()
    const ping = createPingRequest('expired-job')
    const nextPing = createPingRequest('next-job')
    const handler = vi.fn(async () => ({ ok: true }))
    const fetcher = vi.fn(pendingPoll)
      .mockResolvedValueOnce(new Response(JSON.stringify({ requestId: ping.requestId, request: ping })))
      .mockResolvedValueOnce(new Response('{}', { status }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ requestId: nextPing.requestId, request: nextPing })))
      .mockResolvedValueOnce(new Response('{}'))
    controllers.push(startSellerSpriteMcpBridge(handler, { storage: storageFixture(), fetch: fetcher }))
    await flush()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetcher.mock.calls.map(([input]) => new URL(input).pathname)).toEqual([
      '/v1/bridge/poll', '/v1/bridge/result', '/v1/bridge/poll', '/v1/bridge/result', '/v1/bridge/poll',
    ])
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenNthCalledWith(1, ping)
    expect(handler).toHaveBeenNthCalledWith(2, nextPing)
    expect(JSON.parse(fetcher.mock.calls[3]?.[1].body as string)).toEqual({ requestId: nextPing.requestId, response: { ok: true } })
  })

  it('waits for the original handler after token rotation and sends its result once with the new token', async () => {
    vi.useFakeTimers()
    const lifecycle = lifecycleFixture()
    const ping = createPingRequest('rotated-pending-job')
    const response = { ok: true, data: { connected: true } }
    let finishHandler!: () => void
    const handler = vi.fn(() => new Promise((resolve) => { finishHandler = () => resolve(response) }))
    const fetcher = vi.fn(pendingPoll)
      .mockResolvedValueOnce(new Response(JSON.stringify({ requestId: ping.requestId, request: ping })))
      .mockResolvedValueOnce(new Response('{}'))
    vi.stubGlobal('fetch', fetcher)
    cleanups.push(installSellerSpriteMcpBridge(handler))
    await flush()
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(ping)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const firstSignal = fetcher.mock.calls[0]?.[1].signal
    const nextToken = bridgeToken + '-rotated'
    lifecycle.storage.values[SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY] = nextToken
    lifecycle.onChanged.emit({ [SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY]: { newValue: nextToken } }, 'local')
    await flush()
    expect(firstSignal?.aborted).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    finishHandler()
    await flush()
    expect(fetcher.mock.calls.map(([input]) => new URL(input).pathname)).toEqual([
      '/v1/bridge/poll', '/v1/bridge/result', '/v1/bridge/poll',
    ])
    expect(fetcher.mock.calls[1]?.[1].headers).toMatchObject({ authorization: 'Bearer ' + nextToken })
    expect(JSON.parse(fetcher.mock.calls[1]?.[1].body as string)).toEqual({ requestId: ping.requestId, response })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it.each([401, 403])('resends the original result immediately with a corrected token after HTTP %i', async (status) => {
    vi.useFakeTimers()
    const lifecycle = lifecycleFixture()
    const ping = createPingRequest('reauthenticated-job')
    const handler = vi.fn(async () => ({ ok: true }))
    const fetcher = vi.fn(pendingPoll)
      .mockResolvedValueOnce(new Response(JSON.stringify({ requestId: ping.requestId, request: ping })))
      .mockResolvedValueOnce(new Response('{}', { status }))
      .mockResolvedValueOnce(new Response('{}'))
    vi.stubGlobal('fetch', fetcher)
    cleanups.push(installSellerSpriteMcpBridge(handler))
    await flush()
    const body = fetcher.mock.calls[1]?.[1].body
    expect(JSON.parse(body as string)).toEqual({ requestId: ping.requestId, response: { ok: true } })
    expect(fetcher.mock.calls[1]?.[1].headers).toMatchObject({ authorization: 'Bearer ' + bridgeToken })
    expect(lifecycle.storage.values[SELLERSPRITE_MCP_BRIDGE_STATE_KEY]).toMatchObject({ status: 'authentication-error' })
    await vi.advanceTimersByTimeAsync(29_999)
    expect(fetcher).toHaveBeenCalledTimes(2)
    const nextToken = bridgeToken + '-corrected'
    lifecycle.storage.values[SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY] = nextToken
    lifecycle.onChanged.emit({ [SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY]: { newValue: nextToken } }, 'local')
    await flush()
    expect(fetcher.mock.calls.map(([input]) => new URL(input).pathname)).toEqual([
      '/v1/bridge/poll', '/v1/bridge/result', '/v1/bridge/result', '/v1/bridge/poll',
    ])
    expect(fetcher.mock.calls[2]?.[1].body).toBe(body)
    expect(fetcher.mock.calls[2]?.[1].headers).toMatchObject({ authorization: 'Bearer ' + nextToken })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not report malformed localhost responses as a connected MCP service', async () => {
    vi.useFakeTimers()
    const storage = storageFixture()
    const fetcher = vi.fn(pendingPoll).mockResolvedValueOnce(new Response('{}'))
    controllers.push(startSellerSpriteMcpBridge(async () => ({}), { storage, fetch: fetcher }))
    await flush()
    expect(storage.values[SELLERSPRITE_MCP_BRIDGE_STATE_KEY]).toMatchObject({ status: 'waiting-for-service' })
  })

  it('wakes on install, browser startup and alarms without creating duplicate pollers', async () => {
    const lifecycle = lifecycleFixture()
    const fetcher = vi.fn(pendingPoll)
    vi.stubGlobal('fetch', fetcher)
    cleanups.push(installSellerSpriteMcpBridge(async () => ({})))
    await flush()
    expect(lifecycle.alarms.create).toHaveBeenCalledWith(SELLERSPRITE_MCP_BRIDGE_ALARM, { periodInMinutes: 0.5 })
    expect(fetcher).toHaveBeenCalledTimes(1)
    lifecycle.onStartup.emit()
    lifecycle.onInstalled.emit()
    lifecycle.onAlarm.emit({ name: SELLERSPRITE_MCP_BRIDGE_ALARM })
    lifecycle.onAlarm.emit({ name: 'unrelated-alarm' })
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('connects when a secret is saved and immediately replaces an in-flight connection when it changes', async () => {
    const lifecycle = lifecycleFixture(null)
    const fetcher = vi.fn(pendingPoll)
    vi.stubGlobal('fetch', fetcher)
    cleanups.push(installSellerSpriteMcpBridge(async () => ({})))
    await flush()
    expect(fetcher).not.toHaveBeenCalled()
    lifecycle.storage.values[SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY] = bridgeToken
    lifecycle.onChanged.emit({ [SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY]: { newValue: bridgeToken } }, 'local')
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    const firstSignal = fetcher.mock.calls[0]?.[1].signal
    const nextToken = bridgeToken + '-rotated'
    lifecycle.storage.values[SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY] = nextToken
    lifecycle.onChanged.emit({ [SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY]: { newValue: nextToken } }, 'local')
    await flush()
    expect(firstSignal?.aborted).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1]?.[1].headers).toMatchObject({ authorization: 'Bearer ' + nextToken })
    lifecycle.onChanged.emit({ [SELLERSPRITE_MCP_BRIDGE_STATE_KEY]: {} }, 'local')
    lifecycle.onChanged.emit({ [SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY]: {} }, 'sync')
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('cancels polling when the saved secret is removed', async () => {
    const lifecycle = lifecycleFixture()
    const fetcher = vi.fn(pendingPoll)
    vi.stubGlobal('fetch', fetcher)
    cleanups.push(installSellerSpriteMcpBridge(async () => ({})))
    await flush()
    const signal = fetcher.mock.calls[0]?.[1].signal
    delete lifecycle.storage.values[SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY]
    lifecycle.onChanged.emit({ [SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY]: {} }, 'local')
    await flush()
    expect(signal?.aborted).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(lifecycle.storage.values[SELLERSPRITE_MCP_BRIDGE_STATE_KEY]).toMatchObject({ status: 'unconfigured' })
  })

  it('restores a saved connection after the background worker is recreated', async () => {
    const lifecycle = lifecycleFixture()
    const fetcher = vi.fn(pendingPoll)
    vi.stubGlobal('fetch', fetcher)
    const stop = installSellerSpriteMcpBridge(async () => ({}))
    await flush()
    const firstSignal = fetcher.mock.calls[0]?.[1].signal
    stop()
    expect(firstSignal?.aborted).toBe(true)
    expect(lifecycle.onAlarm.listeners.size).toBe(0)
    expect(lifecycle.onChanged.listeners.size).toBe(0)
    cleanups.push(installSellerSpriteMcpBridge(async () => ({})))
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1]?.[1].headers).toMatchObject({ authorization: 'Bearer ' + bridgeToken })
    expect(lifecycle.onAlarm.listeners.size).toBe(1)
  })

  it('bounds a stalled localhost fetch and reconnects instead of getting stuck', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const timeout = new AbortController()
      setTimeout(() => timeout.abort(new DOMException('Timeout', 'TimeoutError')), ms)
      return timeout.signal
    })
    const storage = storageFixture()
    const fetcher = vi.fn(pendingPoll)
    controllers.push(startSellerSpriteMcpBridge(async () => ({}), { storage, fetch: fetcher }))
    await flush()
    expect(AbortSignal.timeout).toHaveBeenCalledWith(25_000)
    await vi.advanceTimersByTimeAsync(25_000)
    expect(storage.values[SELLERSPRITE_MCP_BRIDGE_STATE_KEY]).toMatchObject({ status: 'waiting-for-service' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('only allows SellerSprite target requests and supported read operations', () => {
    expect(isAllowedSellerSpriteMcpRequest(createPingRequest('ping'))).toBe(true)
    expect(isAllowedSellerSpriteMcpRequest(createSellerSpriteMonthlyRequest('monthly', 'amazon', {
      asin: 'B012345678', month: '', station: 'US',
    }))).toBe(false)
    expect(isAllowedSellerSpriteMcpRequest(createSellerSpriteMonthlyRequest('monthly', 'sellersprite', {
      asin: 'B012345678', month: '', station: 'US',
    }))).toBe(true)
    expect(isAllowedSellerSpriteMcpRequest(createTargetRequest('GET_PROFILE', 'profile', 'sellersprite'))).toBe(false)
    expect(isAllowedSellerSpriteMcpRequest(createTargetRequest('REQUEST_TARGET_PERMISSION', 'permission', 'sellersprite'))).toBe(false)
  })

  it('does not run a denied action through the extension handler', async () => {
    const handler = vi.fn(async () => ({ ok: true }))
    const result = await handleSellerSpriteMcpJob({
      requestId: 'denied', request: createTargetRequest('GET_PROFILE', 'profile', 'sellersprite'),
    }, handler)
    expect(handler).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, error: { code: 'UNKNOWN_ACTION' } })
  })

  it('returns unexpected handler failures to MCP instead of losing the leased job', async () => {
    const result = await handleSellerSpriteMcpJob({
      requestId: 'failed-job', request: createPingRequest('failed-job'),
    }, async () => { throw new Error('Internal failure') })
    expect(result).toMatchObject({ requestId: 'failed-job', ok: false, error: { code: 'TARGET_API_ERROR' } })
  })

  it('allows four fixed advertising actions only for SellerSprite and rejects injected request fields', () => {
    const context = { asin: 'B0F9XY6HXB', market: 1, interval: 'week' as const, months: 6 as const }
    const filters = { adId: 'full-group-id', market: 1, interval: 'week' as const, beginDate: '2026-09-01', endDate: '2026-09-07', keyword: '', orderField: 'updatedTime' as const, desc: true }
    const requests = [
      createSellerSpriteAdsInsightsRequest('insights', 'sellersprite', { ...context, desc: false, pageNum: 1, pageSize: 20, orderByEffectiveness: false, type: '', campaignId: '', adId: '', variation: '', combination: false, brief: false }),
      createSellerSpriteAdsHistoryRequest('history', 'sellersprite', { ...context, adId: filters.adId }),
      createSellerSpriteAdsKeywordsRequest('keywords', 'sellersprite', { ...filters, pageNum: 1, pageSize: 50 }),
      createSellerSpriteAdsHighFrequencyRequest('frequency', 'sellersprite', filters),
    ]
    for (const request of requests) {
      expect(isAllowedSellerSpriteMcpRequest(request)).toBe(true)
      expect(isAllowedSellerSpriteMcpRequest({ ...request, payload: { ...request.payload, targetId: 'amazon' } })).toBe(false)
      expect(isAllowedSellerSpriteMcpRequest({ ...request, payload: { ...request.payload, input: { ...request.payload.input, url: 'https://invalid.example' } } })).toBe(false)
    }
  })

  it('rejects a bridge job whose envelope and protocol request ids differ', async () => {
    const handler = vi.fn(async () => ({ ok: true }))
    const result = await handleSellerSpriteMcpJob({
      requestId: 'envelope-id', request: createPingRequest('protocol-id'),
    }, handler)
    expect(handler).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, requestId: 'protocol-id' })
  })
})
