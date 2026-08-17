import {
  DEFAULT_REMOTE_CONFIG_TTL_MS,
  validateRemoteConfig,
  type RemoteConfig,
} from '@cookie-amazon/remote-config'
import { REMOTE_CONFIG_ORIGIN } from '@cookie-amazon/protocol'

const STORAGE_KEY = 'remote-config:last-known-good:v1'
const CONFIG_PATH = '/api/extension/config'
const DEFAULT_CONFIG_FETCH_TIMEOUT_MS = 3_000

type StoredConfig = {
  config: RemoteConfig
  fetchedAt: number
  etag?: string
}

type ConfigResponse =
  | { kind: 'not-modified' }
  | { kind: 'config'; config: RemoteConfig; etag?: string }
  | null

export type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

export type ConfigFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isSafeEtag = (value: unknown): value is string =>
  typeof value === 'string' && /^W\/"[A-Za-z0-9._:-]{1,128}"$/.test(value)

const readStoredConfig = (value: unknown): StoredConfig | null => {
  if (!isRecord(value) || typeof value.fetchedAt !== 'number') return null
  const validated = validateRemoteConfig(value.config)
  if (!validated.ok) return null
  return {
    config: validated.config,
    fetchedAt: value.fetchedAt,
    ...(isSafeEtag(value.etag) ? { etag: value.etag } : {}),
  }
}

const readConfigResponse = async (response: Response): Promise<ConfigResponse> => {
  if (response.status === 304) return { kind: 'not-modified' }
  if (!response.ok) return null
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return null
  }
  if (!isRecord(body) || body.ok !== true) return null
  const validated = validateRemoteConfig(body.config)
  if (!validated.ok) return null
  const etag = response.headers.get('etag')
  return { kind: 'config', config: validated.config, ...(isSafeEtag(etag) ? { etag } : {}) }
}

const storedValue = (config: RemoteConfig, fetchedAt: number, etag?: string): StoredConfig => ({
  config,
  fetchedAt,
  ...(etag === undefined ? {} : { etag }),
})

export class ExtensionRemoteConfigManager {
  public constructor(
    private readonly storage: StorageArea,
    private readonly fetcher: ConfigFetch = (input, init) => fetch(input, init),
    private readonly now: () => number = Date.now,
    private readonly ttlMs = DEFAULT_REMOTE_CONFIG_TTL_MS,
    private readonly fetchTimeoutMs = DEFAULT_CONFIG_FETCH_TIMEOUT_MS,
  ) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('INVALID_CONFIG_TTL')
    if (!Number.isFinite(fetchTimeoutMs) || fetchTimeoutMs <= 0) throw new Error('INVALID_CONFIG_FETCH_TIMEOUT')
  }

  public async load(): Promise<RemoteConfig | null> {
    const stored = readStoredConfig((await this.storage.get(STORAGE_KEY))[STORAGE_KEY])
    if (stored && this.now() - stored.fetchedAt < this.ttlMs) return stored.config

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs)
    try {
      const response = await readConfigResponse(await this.fetcher(
        new URL(CONFIG_PATH, REMOTE_CONFIG_ORIGIN),
        {
          method: 'GET',
          credentials: 'omit',
          cache: 'no-store',
          signal: controller.signal,
          ...(stored?.etag ? { headers: { 'if-none-match': stored.etag } } : {}),
        },
      ))
      if (response?.kind === 'not-modified') {
        if (!stored) return null
        await this.storage.set({ [STORAGE_KEY]: storedValue(stored.config, this.now(), stored.etag) })
        return stored.config
      }
      if (!response) return stored?.config ?? null
      await this.storage.set({ [STORAGE_KEY]: storedValue(response.config, this.now(), response.etag) })
      return response.config
    } catch {
      return stored?.config ?? null
    } finally {
      clearTimeout(timeout)
    }
  }
}

export {
  CONFIG_PATH,
  DEFAULT_CONFIG_FETCH_TIMEOUT_MS,
  STORAGE_KEY,
  isSafeEtag,
  readConfigResponse,
  readStoredConfig,
}