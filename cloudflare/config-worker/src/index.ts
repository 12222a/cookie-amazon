import {
  createConfigKey,
  DEFAULT_REMOTE_CONFIG_TTL_MS,
  RemoteConfigCache,
  type ConfigLoadResult,
  type ConfigStore,
  type RemoteConfig,
} from '@cookie-amazon/remote-config'

import { handleFashionApi, isFashionApiPath, runScheduledGeneration, type FashionEnv } from './fashion-api'

interface Env extends FashionEnv {
  ASSETS: Fetcher
  EXTENSION_CONFIG: KVNamespace
  CONFIG_ENVIRONMENT?: string
  CONFIG_TTL_MS?: string
}

const CONFIG_PATH = '/api/extension/config'
const cacheRegistry = new WeakMap<KVNamespace, Map<string, RemoteConfigCache>>()

const json = (body: unknown, status = 200, headers: HeadersInit = {}): Response => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  },
})

const getTtl = (value: string | undefined): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REMOTE_CONFIG_TTL_MS
}

const getConfigCache = (env: Env): RemoteConfigCache => {
  const environment = env.CONFIG_ENVIRONMENT ?? 'production'
  const key = createConfigKey(environment)
  let environmentCaches = cacheRegistry.get(env.EXTENSION_CONFIG)
  if (!environmentCaches) {
    environmentCaches = new Map()
    cacheRegistry.set(env.EXTENSION_CONFIG, environmentCaches)
  }

  const existing = environmentCaches.get(key)
  if (existing) return existing

  const store: ConfigStore = {
    get: (storeKey) => env.EXTENSION_CONFIG.get(storeKey),
  }
  const cache = new RemoteConfigCache(store, { key, ttlMs: getTtl(env.CONFIG_TTL_MS) })
  environmentCaches.set(key, cache)
  return cache
}

const configEtag = (config: RemoteConfig): string => `W/"config-${config.configVersion}"`

const configResponse = (result: ConfigLoadResult, request: Request): Response => {
  if (!result.ok) return json({ ok: false, status: result.status, stale: false, error: result.error }, 503)
  const etag = configEtag(result.config)
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag, 'cache-control': 'no-store' } })
  }
  return json({
    ok: true,
    status: result.status,
    stale: result.stale,
    source: result.source,
    fetchedAt: result.fetchedAt,
    validatedAt: result.validatedAt,
    config: result.config,
  }, 200, { etag })
}

const hasForbiddenCredentialHeaders = (request: Request): boolean =>
  request.headers.has('cookie')
  || request.headers.has('authorization')
  || request.headers.has('x-csrf-token')

export default {
  async scheduled(_controller: ScheduledController, env: Env, _context: ExecutionContext): Promise<void> {
    await runScheduledGeneration(env)
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/health') return json({ ok: true, service: 'cookie-amazon-business-api', sharedLibrary: true, collaboration: true })
    if (url.pathname === CONFIG_PATH) {
      if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405)
      if (hasForbiddenCredentialHeaders(request)) return json({ ok: false, error: 'CREDENTIAL_HEADERS_FORBIDDEN' }, 400)
      return configResponse(await getConfigCache(env).load(), request)
    }
    if (isFashionApiPath(url.pathname)) return handleFashionApi(request, env)
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

export { configEtag, configResponse, getConfigCache }