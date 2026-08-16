import { describe, expect, it } from 'vitest'
import {
  RemoteConfigCache,
  createConfigKey,
  parseRemoteConfig,
  validateRemoteConfig,
} from '../index'

const validConfig = {
  schemaVersion: 1,
  configVersion: 20,
  minimumExtensionVersion: '0.1.0',
  features: { beta: false },
  targets: {
    targetA: {
      enabled: true,
      features: { profile: true },
      operations: {
        CHECK_LOGIN: { enabled: true, path: '/api/me', method: 'GET', timeoutMs: 8000 },
      },
    },
  },
}

describe('remote config schema', () => {
  it('accepts the version 1 schema and creates the expected KV key', () => {
    expect(validateRemoteConfig(validConfig)).toEqual({ ok: true, config: validConfig })
    expect(createConfigKey('production')).toBe('extension:production:config')
  })

  it('rejects unsafe paths, unsupported methods, and unknown schema versions', () => {
    expect(validateRemoteConfig({ ...validConfig, schemaVersion: 2 }).ok).toBe(false)
    expect(validateRemoteConfig({
      ...validConfig,
      targets: {
        targetA: {
          ...validConfig.targets.targetA,
          operations: { CHECK_LOGIN: { enabled: true, path: 'https://evil.example', method: 'GET', timeoutMs: 8000 } },
        },
      },
    }).ok).toBe(false)
    expect(parseRemoteConfig('{not-json').ok).toBe(false)
  })
})

describe('remote config cache', () => {
  it('uses memory cache within TTL and refreshes after TTL', async () => {
    let now = 1_000
    let reads = 0
    const cache = new RemoteConfigCache({
      async get() { reads += 1; return JSON.stringify(validConfig) },
    }, { key: 'extension:production:config', ttlMs: 100, now: () => now })

    const first = await cache.load()
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error('expected valid config')
    expect(first.source).toBe('kv')
    const second = await cache.load()
    expect(second.ok).toBe(true)
    if (!second.ok) throw new Error('expected cached config')
    expect(second.source).toBe('memory')
    expect(reads).toBe(1)
    now += 101
    const refreshed = await cache.load()
    expect(refreshed.ok).toBe(true)
    if (!refreshed.ok) throw new Error('expected refreshed config')
    expect(refreshed.source).toBe('kv')
    expect(reads).toBe(2)
  })

  it('returns LKG for an unavailable or invalid KV value', async () => {
    let raw: string | null = JSON.stringify(validConfig)
    let now = 1_000
    const cache = new RemoteConfigCache({
      async get() { if (raw === 'throw') throw new Error('KV down'); return raw },
    }, { key: 'extension:production:config', ttlMs: 100, now: () => now })

    expect((await cache.load()).status).toBe('fresh')
    now += 101
    raw = 'throw'
    expect(await cache.load()).toMatchObject({ ok: true, status: 'stale', stale: true, source: 'memory' })
    raw = '{bad-json'
    expect(await cache.load()).toMatchObject({ ok: true, status: 'last-known-good', stale: true })
  })

  it('fails safely when no valid config is available', async () => {
    const cache = new RemoteConfigCache({ async get() { return '{bad-json' } }, { key: 'key' })
    expect(await cache.load()).toEqual({ ok: false, status: 'invalid', stale: false, error: 'CONFIG_INVALID' })
  })
})