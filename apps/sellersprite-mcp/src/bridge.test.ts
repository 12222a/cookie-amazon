import { afterEach, describe, expect, it } from 'vitest'
import { createBridgeServer } from './bridge.js'

const token = 'test-token-with-at-least-32-characters-long'
const bridges: Array<ReturnType<typeof createBridgeServer>> = []

const startBridge = async () => {
  const bridge = createBridgeServer({ token, timeoutMs: 1000 })
  bridges.push(bridge)
  await bridge.listen(0)
  const address = bridge.server.address()
  if (!address || typeof address === 'string') throw new Error('NO_BRIDGE_ADDRESS')
  return { bridge, base: 'http://127.0.0.1:' + address.port }
}

const post = (base: string, path: string, auth = token, body = '{}') => fetch(base + path, {
  method: 'POST', headers: { authorization: 'Bearer ' + auth, 'content-type': 'application/json' }, body,
})

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.close()))
})

describe('SellerSprite MCP local bridge', () => {
  it('rejects weak secrets', () => {
    expect(() => createBridgeServer({ token: 'short' })).toThrow('at least 32 characters')
  })

  it('requires bearer auth and rejects unknown paths', async () => {
    const { base } = await startBridge()
    expect((await post(base, '/v1/bridge/poll', 'wrong')).status).toBe(401)
    expect((await post(base, '/unknown')).status).toBe(404)
  })

  it('delivers an enqueued request to the extension and resolves its result', async () => {
    const { bridge, base } = await startBridge()
    const request = { requestId: 'request-1', request: { action: 'PING' } }
    const resultPromise = bridge.enqueue(request)
    const poll = await post(base, '/v1/bridge/poll')
    expect(await poll.json()).toEqual(request)

    const result = { requestId: request.requestId, response: { ok: true, data: { connected: true } } }
    expect((await post(base, '/v1/bridge/result', token, JSON.stringify(result))).status).toBe(200)
    await expect(resultPromise).resolves.toEqual(result.response)
    expect((await post(base, '/v1/bridge/result', token, JSON.stringify(result))).status).toBe(404)
  })

  it('times out pending work and releases the request id', async () => {
    const { bridge } = await startBridge()
    await expect(bridge.enqueue({ requestId: 'expires', request: { action: 'PING' } }, 20)).rejects.toThrow('BRIDGE_TIMEOUT')
    const retry = bridge.enqueue({ requestId: 'expires', request: { action: 'PING' } }, 20)
    await expect(retry).rejects.toThrow('BRIDGE_TIMEOUT')
  })

  it('rejects work when the pending queue is full', async () => {
    const { bridge } = await startBridge()
    const pending = Array.from({ length: 32 }, (_, index) =>
      bridge.enqueue({ requestId: 'queued-' + index, request: { action: 'PING' } }, 5000).catch(() => undefined))
    await expect(bridge.enqueue({ requestId: 'overflow', request: { action: 'PING' } })).rejects.toThrow('BRIDGE_QUEUE_FULL')
    await bridge.close()
    await Promise.all(pending)
  })

  it('rejects an extension origin outside the allowlist during preflight', async () => {
    const { base } = await startBridge()
    const response = await fetch(base + '/v1/bridge/poll', {
      method: 'OPTIONS', headers: { origin: 'https://attacker.example', 'access-control-request-method': 'POST' },
    })
    expect(response.status).toBe(403)
  })
})
