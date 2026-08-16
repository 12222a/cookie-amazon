import {
  DEFAULT_REMOTE_CONFIG_TTL_MS,
  parseRemoteConfig,
  type RemoteConfig,
} from './schema'

export type ConfigStore = {
  get(key: string): Promise<string | null>
}

export type ConfigStatus = 'fresh' | 'stale' | 'last-known-good' | 'unavailable' | 'invalid'

type ConfigSnapshot = {
  config: RemoteConfig
  fetchedAt: number
  validatedAt: number
}

export type ConfigLoadSuccess = {
  ok: true
  status: Extract<ConfigStatus, 'fresh' | 'stale' | 'last-known-good'>
  stale: boolean
  source: 'kv' | 'memory' | 'last-known-good'
  config: RemoteConfig
  fetchedAt: number
  validatedAt: number
}

export type ConfigLoadFailure = {
  ok: false
  status: Extract<ConfigStatus, 'unavailable' | 'invalid'>
  stale: false
  error: 'CONFIG_UNAVAILABLE' | 'CONFIG_INVALID'
}

export type ConfigLoadResult = ConfigLoadSuccess | ConfigLoadFailure

export type ConfigCacheOptions = {
  key: string
  ttlMs?: number
  now?: () => number
}

export class RemoteConfigCache {
  private readonly ttlMs: number
  private readonly now: () => number
  private current: ConfigSnapshot | null = null
  private lastKnownGood: ConfigSnapshot | null = null

  public constructor(private readonly store: ConfigStore, private readonly options: ConfigCacheOptions) {
    this.ttlMs = options.ttlMs ?? DEFAULT_REMOTE_CONFIG_TTL_MS
    this.now = options.now ?? Date.now
    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) throw new Error('INVALID_CONFIG_TTL')
  }

  public async load(): Promise<ConfigLoadResult> {
    const now = this.now()
    if (this.current && now - this.current.fetchedAt < this.ttlMs) {
      return this.success(this.current, 'fresh', false, 'memory')
    }

    let raw: string | null
    try {
      raw = await this.store.get(this.options.key)
    } catch {
      if (this.current) return this.success(this.current, 'stale', true, 'memory')
      if (this.lastKnownGood) return this.success(this.lastKnownGood, 'last-known-good', true, 'last-known-good')
      return this.failure('unavailable')
    }

    if (raw === null) {
      if (this.lastKnownGood) return this.success(this.lastKnownGood, 'last-known-good', true, 'last-known-good')
      return this.failure('unavailable')
    }

    const parsed = parseRemoteConfig(raw)
    if (!parsed.ok) {
      if (this.lastKnownGood) return this.success(this.lastKnownGood, 'last-known-good', true, 'last-known-good')
      return this.failure('invalid')
    }

    const snapshot: ConfigSnapshot = {
      config: parsed.config,
      fetchedAt: now,
      validatedAt: now,
    }
    this.current = snapshot
    this.lastKnownGood = snapshot
    return this.success(snapshot, 'fresh', false, 'kv')
  }

  private success(
    snapshot: ConfigSnapshot,
    status: ConfigLoadSuccess['status'],
    stale: boolean,
    source: ConfigLoadSuccess['source'],
  ): ConfigLoadSuccess {
    return { ok: true, status, stale, source, ...snapshot }
  }

  private failure(status: ConfigLoadFailure['status']): ConfigLoadFailure {
    return {
      ok: false,
      status,
      stale: false,
      error: status === 'invalid' ? 'CONFIG_INVALID' : 'CONFIG_UNAVAILABLE',
    }
  }
}