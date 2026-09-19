import { describe, expect, it, vi } from 'vitest'
import { buildFacts, handleAnalysisApi, type AnalysisEnv } from '../analysis-api'
import type { AnalysisEvidence } from '@cookie-amazon/protocol'

const evidence: AnalysisEvidence = {
  asin: 'B0ABCDEFGH',
  market: 'US',
  object: {
    source: 'manual', title: null, price: null, rating: null, reviews: null, sponsored: null,
  },
  keyword: null,
  reviews: null,
  record: null,
}

const env: AnalysisEnv = {
  ANALYSIS_API_BASE_URL: 'https://ai.example/v1',
  ANALYSIS_API_KEY: 'secret',
  ANALYSIS_MODEL: 'test-model',
}

const request = (overrides: Record<string, unknown> = {}, init: RequestInit = {}): Request => new Request(
  'https://research.example/api/analysis/ask',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: 1,
      asin: evidence.asin,
      market: evidence.market,
      question: '当前最需要关注什么？',
      evidence,
      ...overrides,
    }),
    ...init,
  },
)

const modelResponse = (overrides: Record<string, unknown> = {}): Response => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify({
    facts: ['ASIN 是 B0ABCDEFGH'],
    inferences: ['当前证据有限，先补充数据'],
    citations: ['object.asin'],
    views: ['object-summary'],
    ...overrides,
  }) } }],
}))

describe('analysis worker api', () => {
  it('passes monthly search volumes to the model and rejects more than 16 citations', async () => {
    const richEvidence: AnalysisEvidence = { ...evidence, keyword: {
      summary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 1, sourceTypeCounts: [] },
      rows: [{ keyword: 'stand', natural: '1', ad: '2', naturalShare: '80%', adShare: '20%', types: '自然',
        trend: { kind: 'line', pointCount: 6, sampleCount: 6, segments: [Array.from({ length: 6 }, (_, index) => ({ month: '2026-0' + (index + 1), searches: 100 + index * 10, index }))] } }],
    } }
    const facts = buildFacts(richEvidence)
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body))
      expect(JSON.parse(sent.messages[1].content).facts).toContainEqual(expect.objectContaining({ label: '关键词 stand 2026-06 搜索量', value: '150' }))
      return modelResponse({ citations: facts.slice(0, 17).map((item) => item.id) })
    })
    const response = await handleAnalysisApi(request({ evidence: richEvidence }), env, fetcher as typeof fetch)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: 'AI_RESPONSE_INVALID' })
  })

  it.each([undefined, '1', '65537'])('rejects oversized model streams with content-length %s and cancels reading', async (length) => {
    const cancel = vi.fn()
    let chunks = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunks += 1
        controller.enqueue(new TextEncoder().encode('字'.repeat(11_000)))
      },
      cancel,
    })
    const headers: HeadersInit = length === undefined ? {} : { 'content-length': length }
    const fetcher = vi.fn(async () => new Response(stream, { headers }))
    const response = await handleAnalysisApi(request(), env, fetcher as typeof fetch)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: 'AI_RESPONSE_INVALID', message: 'AI 返回内容过大' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(chunks).toBeLessThanOrEqual(3)
  })

  it('accepts a model response exactly at the byte limit across chunks', async () => {
    const valid = await modelResponse().text()
    const bytes = new TextEncoder().encode(valid)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 77))
        controller.enqueue(bytes.slice(77))
        controller.enqueue(new TextEncoder().encode(' '.repeat(65536 - bytes.length)))
        controller.close()
      },
    })
    const response = await handleAnalysisApi(request(), env, vi.fn(async () => new Response(stream)) as typeof fetch)
    expect(response.status).toBe(200)
  })

  it('rejects malformed upstream JSON as an invalid model response', async () => {
    const response = await handleAnalysisApi(request(), env, vi.fn(async () => new Response('{')) as typeof fetch)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: 'AI_RESPONSE_INVALID' })
  })

  it('normalizes unavailable review views at the API boundary', async () => {
    const response = await handleAnalysisApi(request(), env, vi.fn(async () => modelResponse({ views: ['review-pain-points'] })) as typeof fetch)
    expect(await response.json()).toMatchObject({ ok: true, view: { views: ['object-summary'] } })
  })

  it('rejects non-JSON and non-POST requests before calling the model', async () => {
    const fetcher = vi.fn()
    const wrongMethod = await handleAnalysisApi(new Request('https://research.example/api/analysis/ask'), env, fetcher as typeof fetch)
    const wrongType = await handleAnalysisApi(new Request('https://research.example/api/analysis/ask', {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x',
    }), env, fetcher as typeof fetch)
    expect(wrongMethod.status).toBe(405)
    expect(wrongType.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses cost, profit, and compliance questions without using the model', async () => {
    const fetcher = vi.fn()
    const response = await handleAnalysisApi(request({ question: '这个产品利润和合规风险怎么样？' }), env, fetcher as typeof fetch)
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ ok: false, error: 'UNSUPPORTED_SCOPE' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('maps validated model citations back to real evidence and normalizes views', async () => {
    const fetcher = vi.fn(async () => modelResponse())
    const response = await handleAnalysisApi(request(), env, fetcher as typeof fetch)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      answer: {
        facts: ['ASIN 是 B0ABCDEFGH'],
        inferences: ['当前证据有限，先补充数据'],
        citations: [{ id: 'object.asin', label: 'ASIN', value: 'B0ABCDEFGH', source: 'storefront' }],
      },
      view: { schemaVersion: 1, views: ['object-summary'] },
    })
    expect(fetcher).toHaveBeenCalledWith('https://ai.example/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer secret' }),
    }))
  })

  it('rejects a model citation that is not in the evidence set', async () => {
    const fetcher = vi.fn(async () => modelResponse({ citations: ['object.secret'] }))
    const response = await handleAnalysisApi(request(), env, fetcher as typeof fetch)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ ok: false, error: 'AI_RESPONSE_INVALID' })
  })

  it('turns upstream model failures into a stable service error', async () => {
    const fetcher = vi.fn(async () => new Response('upstream failure', { status: 500 }))
    const response = await handleAnalysisApi(request(), env, fetcher as typeof fetch)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, error: 'AI_UNAVAILABLE', message: 'AI 分析服务暂时不可用' })
  })
})
