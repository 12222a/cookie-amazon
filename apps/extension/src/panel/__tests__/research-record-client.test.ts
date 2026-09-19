import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { ResearchRecordClient, describeRecordResult } from '../research-record-client'

const record = {
  asin: 'B07Z82895W', market: 'US', owner: 'amy', group: 'A',
  status: 'researching' as const, summary: '先观察', updatedAt: 1_700_000_000_000,
}

const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
})

describe('research record client', () => {
  it('sends the member token and never the group as a query parameter', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ ok: true, record }))
    const client = new ResearchRecordClient({ origin: 'https://research.example', token: 'tok', fetcher })
    await client.find('B07Z82895W', 'US')
    const [url, init] = (fetcher as unknown as Mock).mock.calls[0] as [RequestInfo | URL, RequestInit]
    expect(String(url)).toBe('https://research.example/api/research/records?asin=B07Z82895W&market=US')
    expect(String(url)).not.toContain('group')
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok' })
  })

  it('refuses to read or write without a token instead of falling back to local data', async () => {
    const fetcher = vi.fn()
    const client = new ResearchRecordClient({ origin: 'https://research.example', token: '', fetcher })
    expect(await client.find('B07Z82895W', 'US')).toEqual({ kind: 'unauthenticated' })
    expect(await client.save({ asin: 'B07Z82895W', market: 'US', status: 'researching', summary: '' })).toEqual({ kind: 'unauthenticated' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('maps 401 and 403 to their own results so the panel can explain them', async () => {
    const unauthorized = new ResearchRecordClient({
      origin: 'https://research.example', token: 'tok',
      fetcher: vi.fn(async () => jsonResponse({ ok: false, error: 'UNAUTHORIZED', message: '访问密钥无效或缺失' }, 401)),
    })
    expect(await unauthorized.find('B07Z82895W', 'US')).toEqual({ kind: 'unauthenticated' })
    const forbidden = new ResearchRecordClient({
      origin: 'https://research.example', token: 'tok',
      fetcher: vi.fn(async () => jsonResponse({ ok: false, error: 'FORBIDDEN', message: '这条记录由 amy 维护，只有作者本人能改' }, 403)),
    })
    expect(await forbidden.save({ asin: 'B07Z82895W', market: 'US', status: 'verified', summary: '' }))
      .toEqual({ kind: 'forbidden', message: '这条记录由 amy 维护，只有作者本人能改' })
  })

  it('treats a missing record as empty rather than an error', async () => {
    const client = new ResearchRecordClient({
      origin: 'https://research.example', token: 'tok',
      fetcher: vi.fn(async () => jsonResponse({ ok: true, record: null })),
    })
    expect(await client.find('B07Z82895W', 'US')).toEqual({ kind: 'none' })
  })

  it('reports an unreachable service without pretending there is no record', async () => {
    const client = new ResearchRecordClient({
      origin: 'https://research.example', token: 'tok',
      fetcher: vi.fn(async () => { throw new Error('offline') }),
    })
    expect(await client.find('B07Z82895W', 'US')).toEqual({ kind: 'unavailable' })
  })

  it('ignores owner and group submitted by the caller: identity is the server\'s job', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ ok: true, record }))
    const client = new ResearchRecordClient({ origin: 'https://research.example', token: 'tok', fetcher })
    await client.save({ asin: 'B07Z82895W', market: 'US', status: 'researching', summary: 'x' })
    const init = (fetcher as unknown as Mock).mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({ asin: 'B07Z82895W', market: 'US', status: 'researching', summary: 'x' })
    expect(body).not.toHaveProperty('owner')
    expect(body).not.toHaveProperty('group')
  })
})

describe('describeRecordResult', () => {
  it('explains each failure in words the user can act on', () => {
    expect(describeRecordResult({ kind: 'unauthenticated' })).toContain('访问密钥')
    expect(describeRecordResult({ kind: 'unavailable' })).toContain('暂时无法连接')
    expect(describeRecordResult({ kind: 'forbidden', message: '这条记录由 amy 维护，只有作者本人能改' })).toContain('amy')
    expect(describeRecordResult({ kind: 'none' })).toBeNull()
    expect(describeRecordResult({ kind: 'found', record })).toBeNull()
  })
})
