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
        schemaVersion: 1,
        asin: evidence.asin,
        market: evidence.market,
        question: '当前最需要关注什么？',
        evidence,
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
