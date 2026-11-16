import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

const MAX_BODY_BYTES = 1_000_000
const MAX_PENDING_REQUESTS = 32
const MAX_RESPONSE_BYTES = 2_000_000
const LEASE_MS = 30_000
const POLL_WAIT_MS = 20_000

type PendingRequest = {
  id: string
  request: unknown
  leaseUntil: number
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type BridgeOptions = { token: string; timeoutMs?: number }
type EnqueuedRequest = { requestId: string; request: unknown }
type BridgeServer = {
  server: Server
  listen(port: number): Promise<void>
  enqueue(request: EnqueuedRequest, timeoutMs?: number): Promise<unknown>
  close(): Promise<void>
}

const sendJson = (response: ServerResponse, status: number, payload: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload))
}

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('BODY_TOO_LARGE'), { statusCode: 413 })
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw Object.assign(new Error('INVALID_JSON'), { statusCode: 400 })
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const allowedExtensionOrigin = (origin: string | undefined): origin is string =>
  origin !== undefined && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)
    || origin !== undefined && /^chrome-extension:\/\/[a-p]{32}$/.test(origin)
    || origin !== undefined && /^moz-extension:\/\/[0-9a-f-]{36}$/.test(origin)

export const createBridgeServer = ({ token, timeoutMs = 120_000 }: BridgeOptions): BridgeServer => {
  if (token.length < 32) throw new Error('SELLERSPRITE_MCP_TOKEN must contain at least 32 characters')
  const pending = new Map<string, PendingRequest>()
  const pollWaiters = new Set<() => void>()

  const nextRequest = async (): Promise<PendingRequest | undefined> => {
    const now = Date.now()
    const item = [...pending.values()].find((candidate) => candidate.leaseUntil <= now)
    if (item) {
      item.leaseUntil = now + LEASE_MS
      return item
    }
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        pollWaiters.delete(finish)
        resolve()
      }
      const timer = setTimeout(finish, POLL_WAIT_MS)
      pollWaiters.add(finish)
    })
    const available = [...pending.values()].find((candidate) => candidate.leaseUntil <= Date.now())
    if (available) available.leaseUntil = Date.now() + LEASE_MS
    return available
  }

  const server = createServer(async (request, response) => {
    const origin = request.headers.origin
    if (origin && allowedExtensionOrigin(origin)) {
      response.setHeader('access-control-allow-origin', origin)
      response.setHeader('vary', 'Origin')
      response.setHeader('access-control-allow-methods', 'POST, OPTIONS')
      response.setHeader('access-control-allow-headers', 'authorization, content-type')
      response.setHeader('access-control-max-age', '600')
    }
    if (request.method === 'OPTIONS') {
      if (!allowedExtensionOrigin(origin)) {
        sendJson(response, 403, { error: 'ORIGIN_NOT_ALLOWED' })
        return
      }
      response.writeHead(204)
      response.end()
      return
    }
    if (request.method !== 'POST' || !['/v1/bridge/poll', '/v1/bridge/result'].includes(request.url ?? '')) {
      sendJson(response, 404, { error: 'NOT_FOUND' })
      return
    }
    if (request.headers.authorization !== 'Bearer ' + token) {
      sendJson(response, 401, { error: 'UNAUTHORIZED' })
      return
    }

    try {
      if (request.url === '/v1/bridge/poll') {
        const item = await nextRequest()
        sendJson(response, 200, item ? { requestId: item.id, request: item.request } : { request: null })
        return
      }

      const body = await readJson(request)
      if (!isRecord(body) || typeof body.requestId !== 'string' || !Object.hasOwn(body, 'response')) {
        sendJson(response, 400, { error: 'INVALID_RESULT' })
        return
      }
      const item = pending.get(body.requestId)
      if (!item) {
        sendJson(response, 404, { error: 'UNKNOWN_REQUEST_ID' })
        return
      }
      if (Buffer.byteLength(JSON.stringify(body.response)) > MAX_RESPONSE_BYTES) {
        sendJson(response, 413, { error: 'RESPONSE_TOO_LARGE' })
        return
      }
      pending.delete(item.id)
      clearTimeout(item.timer)
      item.resolve(body.response)
      sendJson(response, 200, { accepted: true })
    } catch (error) {
      const status = isRecord(error) && typeof error.statusCode === 'number' ? error.statusCode : 400
      if (!response.headersSent) sendJson(response, status, { error: error instanceof Error ? error.message : 'BAD_REQUEST' })
    }
  })

  return {
    server,
    listen(port) {
      return new Promise((resolve, reject) => {
        const onError = (error: Error): void => reject(error)
        server.once('error', onError)
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', onError)
          resolve()
        })
      })
    },
    enqueue(request, requestTimeoutMs = timeoutMs) {
      if (pending.size >= MAX_PENDING_REQUESTS) return Promise.reject(new Error('BRIDGE_QUEUE_FULL'))
      if (typeof request.requestId !== 'string' || request.requestId.length === 0) return Promise.reject(new Error('INVALID_BRIDGE_REQUEST'))
      if (pending.has(request.requestId)) return Promise.reject(new Error('DUPLICATE_REQUEST_ID'))
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(request.requestId)
          reject(new Error('BRIDGE_TIMEOUT'))
        }, requestTimeoutMs)
        pending.set(request.requestId, {
          id: request.requestId,
          request: request.request,
          leaseUntil: 0,
          resolve,
          reject,
          timer,
        })
        pollWaiters.values().next().value?.()
      })
    },
    close() {
      for (const item of pending.values()) {
        clearTimeout(item.timer)
        item.reject(new Error('BRIDGE_CLOSED'))
      }
      pending.clear()
      for (const wake of pollWaiters) wake()
      return new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve()
          return
        }
        server.close((error) => error ? reject(error) : resolve())
      })
    },
  }
}

export const createBridgeRequest = (request: unknown): { requestId: string; request: unknown } => ({
  requestId: randomUUID(),
  request,
})
