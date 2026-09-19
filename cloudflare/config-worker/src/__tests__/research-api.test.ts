import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleResearchApi, type ResearchEnv } from '../research-api'

const keys = { amy: 'a'.repeat(43), ben: 'b'.repeat(43), eve: 'e'.repeat(43) }
let database: DatabaseSync
let env: ResearchEnv
const object = { asin: 'B07Z82895W', market: 'US', summary: '需要更多评论样本', status: 'researching' }

const call = (member: keyof typeof keys | null, method = 'GET', body?: unknown, suffix = '/records?asin=B07Z82895W&market=US') =>
  handleResearchApi(new Request('https://example.com/api/research' + suffix, {
    method,
    headers: { 'content-type': 'application/json', ...(member === null ? {} : { authorization: 'Bearer ' + keys[member] }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env)

beforeEach(() => {
  database = new DatabaseSync(':memory:')
  database.exec(readFileSync(new URL('../../migrations/0004_research_records.sql', import.meta.url), 'utf8'))
  // Real SQLite executes the migration and SQL; only the D1 transport is adapted.
  const db = { prepare: (sql: string) => ({ bind: (...values: Array<string | number>) => ({
    first: async () => database.prepare(sql).get(...values) ?? null,
  }) }) } as unknown as D1Database
  env = { FASHION_DB: db, RESEARCH_MEMBERS: JSON.stringify(Object.entries(keys).map(([name, token]) => ({
    name, group: name === 'eve' ? 'B' : 'A', tokenHash: createHash('sha256').update(token).digest('hex'),
  }))) }
})
afterEach(() => database.close())

describe('research API group isolation', () => {
  it('shares a record with a colleague across requests while denying another group', async () => {
    expect((await call('amy', 'PUT', object)).status).toBe(200)
    expect(await (await call('ben')).json()).toMatchObject({ ok: true, record: { ...object, owner: 'amy', group: 'A' } })
    expect(await (await call('eve')).json()).toEqual({ ok: true, record: null })
    expect((await call(null)).status).toBe(401)
  })
})
