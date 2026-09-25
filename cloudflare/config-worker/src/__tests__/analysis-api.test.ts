import { describe, expect, it, vi } from 'vitest'
import { buildFacts, handleAnalysisApi, parseModelAnswer, type AnalysisEnv } from '../analysis-api'
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
      schemaVersion: 2,
      asin: evidence.asin,
      market: evidence.market,
      question: '当前最需要关注什么？',
      evidence,
      history: { truncated: false, turns: [] },
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

const boundaryStatement = '当前证据仅支持前台、词位、评论和研究记录分析，无法判断成本、利润、法律合规或这个品能不能做。'

describe.each(['facts', 'inferences'] as const)('model %s scope boundary', (field) => {
  it.each([
    '预计利润率为 30%。',
    '采购成本为 5 美元。',
    '这款商品在法律上合法，可以放心销售。',
    '这个品能做。',
    '这个品不能做。',
    '这个品值得投入。',
    '建议直接上架销售。',
    '预计稳赚，值得入场。',
    'Expected net margin is 30%.',
    'Shipping fees are $5 per unit.',
    'This product is legally compliant.',
    'This product is illegal.',
    'This is a viable product to sell.',
    'You should launch this product.',
    '预计利 \n润率为 30%。',
    '预计利\u200b润率为 30%。',
    'ＰＲＯＦＩＴ is guaranteed.',
    '预计**利**润为 30%。',
    '没有成本数据，但这个品能做。',
    '无法判断是否合规，但可以确定没有侵权风险。',
    boundaryStatement + '不过这个品能做。',
    '并非' + boundaryStatement,
  ])('rejects out-of-scope text at the parser: %s', async (text) => {
    const payload = await modelResponse({ [field]: ['ASIN 是 B0ABCDEFGH', text] }).json()
    expect(parseModelAnswer(payload, evidence)).toBeNull()
  })

  it.each(['预计利润率为 30%。', '采购成本为 5 美元。', '这款商品合法。', '这个品能做。'])('rejects unsafe model output for an ordinary question: %s', async (text) => {
    const fetcher = vi.fn(async () => modelResponse({ [field]: [boundaryStatement, text] }))
    const response = await handleAnalysisApi(request(), env, fetcher as typeof fetch)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body).toEqual({ ok: false, error: 'AI_RESPONSE_INVALID', message: 'AI 返回内容无法校验' })
    expect(JSON.stringify(body)).not.toContain(text)
  })

  it('preserves a standalone scope disclaimer without making a product decision', async () => {
    const payload = await modelResponse({ [field]: [boundaryStatement] }).json()
    expect(parseModelAnswer(payload, evidence)?.answer[field]).toEqual([boundaryStatement])
  })
})

describe('analysis worker api', () => {
  it.each(['法律风险如何？', '这个品能不能做？', '是否值得入场？'])('refuses out-of-scope questions before calling the model: %s', async (question) => {
    const fetcher = vi.fn()
    const response = await handleAnalysisApi(request({ question }), env, fetcher as typeof fetch)
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ ok: false, error: 'UNSUPPORTED_SCOPE' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('preserves supported facts, qualified inferences, and evidence citations', async () => {
    const supportedEvidence: AnalysisEvidence = {
      ...evidence,
      object: { ...evidence.object, title: 'Coffee Maker by Costco', price: 19.99, rating: 4.5, reviews: 120, sponsored: true },
      keyword: {
        summary: { totalKeywords: 1, rankedKeywords: 1, adKeywords: 1, sourceTypeCounts: [] },
        rows: [{ keyword: 'coffee maker', natural: '3', ad: '2', naturalShare: '80%', adShare: '20%', types: '自然、广告', trend: { kind: 'unavailable' } }],
      },
    }
    const facts = [
      '前台标题是 Coffee Maker by Costco，价格为 19.99 美元。',
      '前台评分为 4.5，评论数为 120。',
      '前台 Sponsored 标记为是。',
      '关键词 coffee maker 自然位为 3，广告位为 2，自然流量占比为 80%。',
    ]
    const inferences = ['数据不足，评论样本缺失，建议补充评论后再分析痛点。', '词位存在字段冲突，不能据此确定流量结构。', boundaryStatement]
    const ids = ['object.title', 'object.price', 'object.rating', 'object.reviews', 'object.sponsored', 'keyword.row.0.natural', 'keyword.row.0.ad', 'keyword.row.0.naturalShare']
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body))
      const sentFacts = JSON.parse(sent.messages[1].content).facts
      expect(sentFacts).toContainEqual({ id: 'object.sponsored', label: '前台 Sponsored 标记', value: '是', source: 'storefront' })
      return modelResponse({ facts, inferences, citations: ids })
    })
    const response = await handleAnalysisApi(request({ question: 'Coffee Maker 的前台与词位信息是什么？', evidence: supportedEvidence }), env, fetcher as typeof fetch)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      answer: { facts, inferences, citations: buildFacts(supportedEvidence).filter((item) => ids.includes(item.id)) },
    })
  })

  it.each([true, false, null])('describes sponsored=%s as a storefront marker', (sponsored) => {
    const facts = buildFacts({ ...evidence, object: { ...evidence.object, sponsored } })
    expect(facts.find((item) => item.id === 'object.sponsored')).toEqual(sponsored === null ? undefined : {
      id: 'object.sponsored', label: '前台 Sponsored 标记', value: sponsored ? '是' : '否', source: 'storefront',
    })
  })

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
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => modelResponse())
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

  /**
   * 上游的 401/404/429 对应「密钥错、模型名错、额度耗尽」三种完全不同的处置，
   * 所以状态码与上游原文必须带出来；只回一句「暂时不可用」等于让人靠猜。
   */
  it('turns upstream model failures into a service error that names the upstream status and detail', async () => {
    const fetcher = vi.fn(async () => new Response('{"error":"invalid api key"}', { status: 401 }))
    const response = await handleAnalysisApi(request(), env, fetcher as typeof fetch)
    expect(response.status).toBe(503)
    const body = await response.json() as { ok: boolean; error: string; message: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('AI_UNAVAILABLE')
    expect(body.message).toContain('401')
    expect(body.message).toContain('invalid api key')
  })

  it('never echoes a key-shaped string from the upstream error back to the caller', async () => {
    const fetcher = vi.fn(async () => new Response('bad auth for sk-abcdefgh12345678 (Bearer abcdefgh12345678)', { status: 401 }))
    const response = await handleAnalysisApi(request(), env, fetcher as typeof fetch)
    const body = await response.json() as { message: string }
    expect(body.message).not.toContain('sk-abcdefgh12345678')
    expect(body.message).not.toContain('abcdefgh12345678')
    expect(body.message).toContain('[REDACTED]')
  })

  /**
   * 形状匹配只能挡住认识的那几种，而密钥不一定长成那样（DeepSeek 的就不是 sk- 开头）。
   * 我们手上握着真正要保护的那一串，按字面替换才是准的——形状规则只作兜底。
   */
  it('redacts the configured key itself even when its shape is unrecognized', async () => {
    const key = 'ds-9f2c7a4b1e8d6305'
    const fetcher = vi.fn(async () => new Response('incorrect api key provided: ' + key, { status: 401 }))
    const response = await handleAnalysisApi(request(), { ...env, ANALYSIS_API_KEY: key }, fetcher as typeof fetch)
    const body = await response.json() as { message: string }
    expect(body.message).not.toContain(key)
    expect(body.message).toContain('[REDACTED]')
  })
})
describe('analysis history', () => {
  const turn = (question: string, facts: string[], inferences: string[] = []) => ({ question, facts, inferences })

  it('sends each earlier turn as its own message before the current one', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => modelResponse())
    const history = {
      truncated: false,
      turns: [
        turn('它主要靠广告撑着吗？', ['广告位占比 20%。']),
        turn('那长尾词呢？', ['长尾词自然位在第 1 页。'], ['长尾词是主要入口。']),
      ],
    }
    const response = await handleAnalysisApi(request({ history }), env, fetcher as typeof fetch)
    expect(response.status).toBe(200)
    const sent = JSON.parse(String(fetcher.mock.calls[0]![1]!.body))
    expect(sent.messages.map((message: { role: string }) => message.role)).toEqual(['system', 'user', 'user', 'user'])
    // 历史只带问答文本：证据包副本、引用对象与视图规格都不在历史里。
    expect(sent.messages[1].content).toBe(JSON.stringify({ question: '它主要靠广告撑着吗？', facts: ['广告位占比 20%。'], inferences: [] }))
    expect(sent.messages[2].content).toBe(JSON.stringify({ question: '那长尾词呢？', facts: ['长尾词自然位在第 1 页。'], inferences: ['长尾词是主要入口。'] }))
    expect(JSON.parse(sent.messages[3].content)).toEqual({ question: '当前最需要关注什么？', facts: buildFacts(evidence) })
  })

  it('tells the model when earlier turns were dropped, and says nothing when none were', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => modelResponse())
    await handleAnalysisApi(request({ history: { truncated: false, turns: [turn('第一问？', ['事实'])] } }), env, fetcher as typeof fetch)
    const withoutTruncation = JSON.parse(String(fetcher.mock.calls[0]![1]!.body)).messages[0].content
    fetcher.mockClear()
    await handleAnalysisApi(request({ history: { truncated: true, turns: [turn('第一问？', ['事实'])] } }), env, fetcher as typeof fetch)
    const withTruncation = JSON.parse(String(fetcher.mock.calls[0]![1]!.body)).messages[0].content
    // 只在截断过时说这句：模型据此知道上下文不完整，不会以为自己看全了。
    expect(withTruncation).toContain('更早的对话轮次因为轮数上限已被截断')
    expect(withoutTruncation).not.toContain('截断')
  })

  it('re-runs the scope check on every historical turn: a previous answer cannot smuggle out-of-scope text in', async () => {
    const fetcher = vi.fn()
    for (const field of ['question', 'facts', 'inferences'] as const) {
      const bad = turn('它主要靠广告撑着吗？', ['广告位占比 20%。'], ['利润大概 30%。'])
      const history = { truncated: false, turns: [{ ...bad, [field]: field === 'question' ? '这个品能不能做？' : ['预计利润率为 30%。'] }] }
      const response = await handleAnalysisApi(request({ history }), env, fetcher as typeof fetch)
      expect(response.status, field + ' 越界应被拒').toBe(422)
      expect(await response.json()).toMatchObject({ ok: false, error: 'UNSUPPORTED_SCOPE' })
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps a standalone scope disclaimer from an earlier turn readable', async () => {
    const fetcher = vi.fn(async () => modelResponse({ inferences: [boundaryStatement] }))
    const history = { truncated: false, turns: [turn('它主要靠广告撑着吗？', ['广告位占比 20%。'], [boundaryStatement])] }
    const response = await handleAnalysisApi(request({ history }), env, fetcher as typeof fetch)
    expect(response.status).toBe(200)
  })

  it('rejects illegal history instead of silently dropping it', async () => {
    const fetcher = vi.fn()
    const turn = { question: '那长尾词呢？', facts: ['长尾词自然位在第 1 页。'], inferences: [] }
    const cases: Array<[string, unknown]> = [
      ['缺少历史字段', undefined],
      ['版本不匹配', { truncated: false, turns: [], schemaVersion: 1 }],
      ['超过条数上限', { truncated: false, turns: [turn, turn, turn, turn] }],
      ['缺字段', { truncated: false, turns: [{ question: turn.question }] }],
      ['多字段', { truncated: false, turns: [{ ...turn, evidence }] }],
      ['回答超长', { truncated: false, turns: [{ ...turn, facts: ['x'.repeat(1_001)] }] }],
    ]
    for (const [label, history] of cases) {
      const response = await handleAnalysisApi(request(history === undefined ? { history: undefined } : { history }), env, fetcher as typeof fetch)
      expect(response.status, label).toBe(400)
      expect(await response.json(), label).toMatchObject({ ok: false, error: 'BAD_REQUEST' })
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
})
