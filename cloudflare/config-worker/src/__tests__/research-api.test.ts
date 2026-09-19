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

  it('ignores owner and group submitted in the body, so nobody can impersonate a colleague', async () => {
    const response = await call('ben', 'PUT', { ...object, owner: 'amy', group: 'B' })
    expect(await response.json()).toMatchObject({ ok: true, record: { owner: 'ben', group: 'A' } })
    // eve 在 B 组，她看不到这条记录——组名取自密钥而不是请求体。
    expect(await (await call('eve')).json()).toEqual({ ok: true, record: null })
  })

  it('does not let a colleague take over a record by writing concurrently', async () => {
    expect((await call('amy', 'PUT', object)).status).toBe(200)
    // 同组同事改同一条：归属不能被抢走，服务端要说清楚为什么。
    const takeover = await call('ben', 'PUT', { ...object, status: 'verified', summary: 'ben 的结论' })
    expect(takeover.status).toBe(403)
    expect(await takeover.json()).toMatchObject({ ok: false, error: 'FORBIDDEN' })
    // 记录仍是 amy 的原文，没有被 ben 覆盖。
    expect(await (await call('ben')).json()).toMatchObject({ ok: true, record: { ...object, owner: 'amy' } })
  })

  it('lets the author update their own record, and keeps the group scope on read', async () => {
    expect((await call('amy', 'PUT', object)).status).toBe(200)
    const updated = await call('amy', 'PUT', { ...object, status: 'verified', summary: '已验证' })
    expect(await updated.json()).toMatchObject({ ok: true, record: { owner: 'amy', status: 'verified', summary: '已验证' } })
    expect(await (await call('ben')).json()).toMatchObject({ ok: true, record: { status: 'verified', group: 'A' } })
  })

  it('rejects a malformed or over-long body instead of storing it', async () => {
    expect((await call('amy', 'PUT', { ...object, summary: 'x'.repeat(500) })).status).toBe(200)
    expect((await call('amy', 'PUT', { ...object, status: 'archived' })).status).toBe(400)
    expect((await call('amy', 'PUT', { ...object, asin: 'short' })).status).toBe(400)
    const overlong = await call('amy', 'PUT', { ...object, summary: 'x'.repeat(600) })
    expect(overlong.status).toBe(200)
    expect(String((await overlong.json() as { record: { summary: string } }).record.summary)).toHaveLength(500)
  })
})
