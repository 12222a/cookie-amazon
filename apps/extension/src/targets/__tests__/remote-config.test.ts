import { describe, expect, it, vi } from 'vitest'
import { createDefaultRemoteConfig } from '@cookie-amazon/remote-config'
import {
  ExtensionRemoteConfigManager,
  STORAGE_KEY,
  type StorageArea,
} from '../../remote-config'

const response = (config: unknown): Response => new Response(JSON.stringify({ ok: true, config }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
})

const storageFixture = (initial?: unknown): { storage: StorageArea; values: Record<string, unknown> } => {
  const values: Record<string, unknown> = initial === undefined ? {} : { [STORAGE_KEY]: initial }
  return {
    values,
    storage: {
      async get(key) { return { [key]: values[key] } },
      async set(items) { Object.assign(values, items) },
    },
  }
}

describe('ExtensionRemoteConfigManager', () => {
  it('fetches without credentials and stores a validated config', async () => {
    const { storage, values } = storageFixture()
    const config = { ...createDefaultRemoteConfig(), configVersion: 1 }
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://localhost:8787/api/extension/config')
      expect(init?.credentials).toBe('omit')
      return response(config)
    })
    const manager = new ExtensionRemoteConfigManager(storage, fetcher, () => 1000)
    await expect(manager.load()).resolves.toEqual(config)
    expect(values[STORAGE_KEY]).toEqual({ config, fetchedAt: 1000 })
  })

  it('uses fresh cache and falls back to last known good', async () => {
    const config = { ...createDefaultRemoteConfig(), configVersion: 2 }
    const fresh = storageFixture({ config, fetchedAt: 900 })
    const freshFetch = vi.fn(async () => { throw new Error('should not fetch') })
    await expect(new ExtensionRemoteConfigManager(fresh.storage, freshFetch, () => 1000, 500).load()).resolves.toEqual(config)
    expect(freshFetch).not.toHaveBeenCalled()

    const stale = storageFixture({ config, fetchedAt: 0 })
    await expect(new ExtensionRemoteConfigManager(
      stale.storage,
      async () => { throw new Error('offline') },
      () => 1000,
      500,
    ).load()).resolves.toEqual(config)
  })

  it('times out config fetches and falls back without activating config', async () => {
    vi.useFakeTimers()
    try {
      const { storage } = storageFixture()
      const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }))
      const manager = new ExtensionRemoteConfigManager(storage, fetcher, () => 1_000, 500, 100)
      const pending = manager.load()
      await vi.advanceTimersByTimeAsync(100)
      await expect(pending).resolves.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not activate an invalid response without LKG', async () => {
    const { storage } = storageFixture()
    const manager = new ExtensionRemoteConfigManager(storage, async () => response({ schemaVersion: 999 }))
    await expect(manager.load()).resolves.toBeNull()
  })
})