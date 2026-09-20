import { describe, expect, it, vi } from 'vitest'
import type { AnalysisEvidence } from '@cookie-amazon/protocol'
import { askAnalysis } from '../analysis-client'

const evidence: AnalysisEvidence = {
  asin: 'B0ABCDEFGH',
  market: 'US',
  object: {
    source: 'manual',
    title: null,
    price: null,
    rating: null,
    reviews: null,
    sponsored: null,
  },
  keyword: null,
  reviews: null,
  record: null,
}

const successBody = {
  ok: true,
  answer: {
    facts: ['ASIN 是 B0ABCDEFGH'],
    inferences: ['先补充数据'],
    citations: [],
  },
  view: { schemaVersion: 1, views: ['object-summary'] },
}

describe('analysis client', () => {
  it('uses error codes rather than message wording to identify unsupported questions', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'UNSUPPORTED_SCOPE', message: 'This question is outside the supported scope.' }), { status: 422 }))
    await expect(askAnalysis('question', evidence, { fetcher })).resolves.toMatchObject({ kind: 'unsupported-scope' })
  })

  it('keeps the view selection stable for repeated questions about the same evidence', async () => {
    const input: AnalysisEvidence = { ...evidence, asin: 'B0ZZZZZZZZ', record: { owner: 'A', summary: 'notes', status: 'researching', updatedAt: 1 } }
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...successBody, view: { schemaVersion: 1, views: ['research-record'] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify(successBody)))
    const first = await askAnalysis('question', input, { fetcher })
    const second = await askAnalysis('question', input, { fetcher })
    expect(first.kind).toBe('answer')
    expect(second).toEqual(first)
  })

  it('sends the trimmed question and returns a validated answer', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect(init?.credentials).toBe('omit')
      expect(init?.cache).toBe('no-store')
      expect(init?.headers).toEqual({ 'content-type': 'application/json' })
      expect(JSON.parse(String(init?.body))).toMatchObject({
        schemaVersion: 2,
        asin: evidence.asin,
        market: evidence.market,
        question: '当前最需要关注什么？',
        evidence,
        history: { truncated: false, turns: [] },
      })
      return new Response(JSON.stringify(successBody), { status: 200 })
    })

    await expect(askAnalysis('  当前最需要关注什么？  ', evidence, { fetcher })).resolves.toEqual({
      kind: 'answer',
      response: successBody,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('turns a non-2xx response into a stable failure result', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: 'AI_UNAVAILABLE',
      message: 'AI 分析服务暂时不可用',
    }), { status: 503 }))

    await expect(askAnalysis('问题', evidence, { fetcher })).resolves.toEqual({
      kind: 'failed',
      reason: 'AI 分析服务暂时不可用',
    })
  })

  it('rejects a successful HTTP response whose body cannot be validated', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await expect(askAnalysis('问题', evidence, { fetcher })).resolves.toEqual({
      kind: 'failed',
      reason: 'AI 返回内容无法校验',
    })
  })

  it('turns an abort caused by the request timeout into a retryable failure', async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))

    await expect(askAnalysis('问题', evidence, { fetcher, timeoutMs: 5 })).resolves.toEqual({
      kind: 'failed',
      reason: '请求超时，请重试',
    })
  })
})
describe('analysis history', () => {
  const turn = (question: string, facts: string[], inferences: string[] = []) => ({ question, facts, inferences })
  const outbound = (fetcher: { mock: { calls: unknown[][] } }): Record<string, unknown> =>
    JSON.parse(String((fetcher.mock.calls[0]![1] as RequestInit).body))

  const okResponse = (): Response => new Response(JSON.stringify(successBody), { status: 200 })

  it('sends at most the three most recent turns, oldest dropped first', async () => {
    const fetcher = vi.fn(async () => okResponse())
    const history = [turn('第一问', ['事实 1']), turn('第二问', ['事实 2']), turn('第三问', ['事实 3']), turn('第四问', ['事实 4'])]
    await askAnalysis('第五问', evidence, { fetcher, history })
    expect(outbound(fetcher).history).toEqual({
      // 截断了就要说出来：模型据此知道上下文不完整，也不会以为自己看全了。
      truncated: true,
      turns: [turn('第二问', ['事实 2']), turn('第三问', ['事实 3']), turn('第四问', ['事实 4'])],
    })
  })

  it('leaves the history out of the evidence slot: only the current bundle travels with the request', async () => {
    const fetcher = vi.fn(async () => okResponse())
    await askAnalysis('那长尾词呢？', evidence, { fetcher, history: [turn('它主要靠广告撑着吗？', ['广告位占比 20%。'])] })
    const body = outbound(fetcher)
    expect(body.evidence).toEqual(evidence)
    expect(JSON.stringify(body.history)).not.toContain('keyword')
    expect(body.history).toEqual({ truncated: false, turns: [turn('它主要靠广告撑着吗？', ['广告位占比 20%。'])] })
  })

  it('sends exactly three turns verbatim without claiming a truncation', async () => {
    const fetcher = vi.fn(async () => okResponse())
    const turns = [turn('第一问', ['事实 1']), turn('第二问', ['事实 2']), turn('第三问', ['事实 3'])]
    await askAnalysis('第四问', evidence, { fetcher, history: turns })
    expect(outbound(fetcher).history).toEqual({ truncated: false, turns })
  })

  it('keeps a request that would exceed the byte ceiling out of the history instead of failing the turn forever', async () => {
    const fetcher = vi.fn(async () => okResponse())
    // 每条都合法，合起来却会把请求顶过 128KB：重试发的是同一个请求体，一旦这样发出去就永远过不去。
    const heavy = turn('重', ['x'.repeat(1_000), 'x'.repeat(1_000), 'x'.repeat(1_000), 'x'.repeat(1_000)])
    await askAnalysis('第五问', evidence, { fetcher, history: [heavy, heavy, heavy, heavy] })
    const sent = outbound(fetcher).history as { truncated: boolean; turns: unknown[] }
    expect(sent.truncated).toBe(true)
    expect(sent.turns.length).toBeLessThan(4)
  })

  it('sends an empty history when there is nothing to carry', async () => {
    const fetcher = vi.fn(async () => okResponse())
    await askAnalysis('第一问', evidence, { fetcher })
    expect(outbound(fetcher).history).toEqual({ truncated: false, turns: [] })
  })
})
