import { describe, expect, it } from 'vitest'
import worker from '../index'

const rawConfig = JSON.stringify({
  schemaVersion: 1,
  configVersion: 1,
  minimumExtensionVersion: '0.1.0',
  features: {},
  targets: {},
})

const createEnv = (value: string | null) => {
  let reads = 0
  const env = {
    ASSETS: { fetch: async () => new Response('asset') },
    EXTENSION_CONFIG: {
      get: async () => { reads += 1; return value },
    },
    CONFIG_ENVIRONMENT: 'test',
    CONFIG_TTL_MS: '100',
  }
  return { env, reads: () => reads }
}

describe('config worker', () => {
  it('returns a validated config and reuses the worker cache', async () => {
    const fixture = createEnv(rawConfig)
    const env = fixture.env as unknown as Parameters<typeof worker.fetch>[1]
    const request = new Request('https://config.example/api/extension/config')

    const first = await worker.fetch(request, env)
    const second = await worker.fetch(request, env)

    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ ok: true, status: 'fresh', config: { configVersion: 1 } })
    expect(second.status).toBe(200)
    expect(fixture.reads()).toBe(1)
  })

  it('rejects credential headers and non-GET config requests', async () => {
    const fixture = createEnv(rawConfig)
    const env = fixture.env as unknown as Parameters<typeof worker.fetch>[1]

    const withCookie = await worker.fetch(new Request('https://config.example/api/extension/config', {
      headers: { cookie: 'target_session=secret' },
    }), env)
    const post = await worker.fetch(new Request('https://config.example/api/extension/config', { method: 'POST' }), env)

    expect(withCookie.status).toBe(400)
    expect(await withCookie.json()).toEqual({ ok: false, error: 'CREDENTIAL_HEADERS_FORBIDDEN' })
    expect(post.status).toBe(405)
  })

  it('does not expose invalid KV content', async () => {
    const fixture = createEnv('{not-json')
    const env = fixture.env as unknown as Parameters<typeof worker.fetch>[1]
    const response = await worker.fetch(new Request('https://config.example/api/extension/config'), env)

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, status: 'invalid', stale: false, error: 'CONFIG_INVALID' })
  })
})