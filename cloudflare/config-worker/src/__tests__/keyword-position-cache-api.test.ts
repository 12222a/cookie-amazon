import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { handleResearchApi, type ResearchEnv } from '../research-api'

const tokens = { amy: 'a'.repeat(43), ben: 'b'.repeat(43), eve: 'e'.repeat(43) }
let database: DatabaseSync
let env: ResearchEnv
const endpoint = 'https://example.com/api/research/keyword-positions?asin=B07Z82895W&market=US'
const call = (who: keyof typeof tokens | null, method = 'GET', body?: string, url = endpoint) =>
  handleResearchApi(new Request(url, {
    method,
    headers: who === null ? {} : { authorization: 'Bearer ' + tokens[who] },
    ...(body === undefined ? {} : { body }),
  }), env)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-20T00:00:00Z'))
  database = new DatabaseSync(':memory:')
  database.exec(readFileSync(new URL('../../migrations/0005_keyword_position_cache.sql', import.meta.url), 'utf8'))
  const db = { prepare: (sql: string) => ({ bind: (...values: Array<string | number | Uint8Array>) => ({
    first: async () => database.prepare(sql).get(...values) ?? null,
    run: async () => database.prepare(sql).run(...values),
  }) }) } as unknown as D1Database
  env = { FASHION_DB: db, RESEARCH_MEMBERS: JSON.stringify(Object.entries(tokens).map(([name, token]) => ({
    name, group: name === 'eve' ? 'B' : 'A', tokenHash: createHash('sha256').update(token).digest('hex'),
  }))) }
})
afterEach(() => { database.close(); vi.useRealTimers() })

it('shares exact bytes across machines in one group, but not across groups', async () => {
  const bytes = '{"items":[],"literal":"\u4e2d"}'
  expect((await call('amy', 'PUT', bytes)).status).toBe(204)
  const colleague = await call('ben')
  expect(colleague.status).toBe(200)
  expect(await colleague.text()).toBe(bytes)
  expect(colleague.headers.get('x-cache-age-ms')).toBe('0')
  expect((await call('eve')).status).toBe(404)
  expect((await call(null)).status).toBe(401)
})

it('expires by server time at exactly 24 hours and refreshes after a miss', async () => {
  await call('amy', 'PUT', '{"items":[]}')
  vi.advanceTimersByTime(24 * 60 * 60_000 - 1)
  expect((await call('ben')).status).toBe(200)
  vi.advanceTimersByTime(1)
  expect((await call('ben')).status).toBe(404)
  expect((await call('ben', 'PUT', '{"items":[1]}')).status).toBe(204)
  expect(await (await call('amy')).text()).toBe('{"items":[1]}')
})

it('rejects invalid keys and oversized bytes with distinct codes', async () => {
  const badAsin = endpoint.replace('B07Z82895W', 'bad')
  const badMarket = endpoint.replace('market=US', 'market=' + 'X'.repeat(17))
  expect(await (await call('amy', 'GET', undefined, badAsin)).json()).toMatchObject({ error: 'BAD_REQUEST' })
  expect(await (await call('amy', 'PUT', '{}', badMarket)).json()).toMatchObject({ error: 'BAD_REQUEST' })
  const tooLarge = await call('amy', 'PUT', 'x'.repeat(512 * 1024 + 1))
  expect(tooLarge.status).toBe(413)
  expect(await tooLarge.json()).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' })
})
