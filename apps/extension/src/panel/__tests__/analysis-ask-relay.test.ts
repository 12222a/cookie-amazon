import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_ASK_PATH,
  ANALYSIS_ASK_SCHEMA_VERSION,
  REMOTE_CONFIG_ORIGIN,
  type AnalysisAskRequest,
  type AnalysisEvidence,
} from '@cookie-amazon/protocol'
import { askAnalysis } from '../analysis-client'
import {
  ANALYSIS_ASK_RELAY_ACTION,
  analysisFetchThroughBackground,
  registerAnalysisAskRelay,
} from '../analysis-ask-relay'

/**
 * 提问经 background 中转（#24）。
 *
 * 断言的是外部行为：background 把**它自己拼的** URL 与请求头交给提问端点，页面侧给多少
 * 都没用；不合规的请求体一个字节都不出站；通道断了或超时，提问按既有失败语义结束。
 * 不比对内部调用顺序，也不断言 fetch 的实现细节。
 */

const evidence: AnalysisEvidence = {
  asin: 'B0ABCDEFGH',
  market: 'US',
  object: { source: 'manual', title: null, price: null, rating: null, reviews: null, sponsored: null },
  keyword: null,
  reviews: null,
  record: null,
}

const body = (question = '这个词位结构更依赖自然位还是广告位？'): AnalysisAskRequest => ({
  schemaVersion: ANALYSIS_ASK_SCHEMA_VERSION,
  asin: evidence.asin,
  market: evidence.market,
  question,
  evidence,
  history: { truncated: false, turns: [] },
})

const successBody = {
  ok: true,
  answer: { facts: ['前台价格是 29.99 美元。'], inferences: [], citations: [] },
  view: { schemaVersion: 1, views: ['object-summary'] },
}

/** background 那一侧：注册的是真的 handler，fetch 是替身，用来钉住它拿到的东西。 */
const background = (answers: Array<{ status: number; body: string } | Error>) => {
  const calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body: string } }> = []
  let listener: ((message: unknown) => unknown) | null = null
  let index = 0
  registerAnalysisAskRelay({
    runtime: { onMessage: { addListener(next) { listener = next } } },
    fetch: async (url, init) => {
      calls.push({ url, init })
      const answer = answers[index++]
      if (answer === undefined) throw new Error('no canned answer')
      if (answer instanceof Error) throw answer
      return { status: answer.status, text: async () => answer.body }
    },
  })
  // 与浏览器里一样：页面侧发一条消息，拿到 listener 的回复。
  const send = async (message: unknown): Promise<unknown> => listener?.(message)
  return { calls, send }
}

const relayMessage = (request: unknown) => ({ action: ANALYSIS_ASK_RELAY_ACTION, request })

describe('提问中转的 background 一侧', () => {
  it('把它自己拼的端点与请求头交给提问端点，请求体原样发出去', async () => {
    const { calls, send } = background([{ status: 200, body: JSON.stringify(successBody) }])
    const request = body()
    const reply = await send(relayMessage({ body: JSON.stringify(request) }))
    expect(reply).toEqual({ delivered: true, status: 200, body: JSON.stringify(successBody) })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(new URL(ANALYSIS_ASK_PATH, REMOTE_CONFIG_ORIGIN).toString())
    expect(calls[0]!.init.method).toBe('POST')
    expect(calls[0]!.init.headers).toEqual({ 'content-type': 'application/json' })
    // 校验的就是随后原样发出的那些字节：验证过的与发出去的不是两份。
    expect(JSON.parse(calls[0]!.init.body)).toEqual(request)
  })

  it('端点答复什么就带回什么，失败状态与正文都不改写', async () => {
    const refused = { ok: false, error: 'UNSUPPORTED_SCOPE', message: '当前只能分析前台、词位、评论和研究记录。' }
    const { send } = background([{ status: 422, body: JSON.stringify(refused) }])
    // 越界与否是端点的判断：中转只搬运，不改写成另一个说法。
    expect(await send(relayMessage({ body: JSON.stringify(body()) })))
      .toEqual({ delivered: true, status: 422, body: JSON.stringify(refused) })
  })

  it('页面侧给不了 URL 与请求头，多带一个字段就整条拒掉', async () => {
    const { calls, send } = background([])
    const request = JSON.stringify(body())
    expect(await send(relayMessage({ body: request, url: 'https://attacker.example/v1/ask' })))
      .toEqual({ delivered: false, reason: 'INVALID_REQUEST' })
    expect(await send(relayMessage({ body: request, headers: { authorization: 'Bearer stolen' } })))
      .toEqual({ delivered: false, reason: 'INVALID_REQUEST' })
    expect(calls).toHaveLength(0)
  })

  it('不合规的请求体一个字节都不出站', async () => {
    const { calls, send } = background([])
    // 版本对不上、字段对不上、根本不是 JSON：三种都在这里被挡下。
    expect(await send(relayMessage({ body: JSON.stringify({ ...body(), schemaVersion: 1 }) })))
      .toEqual({ delivered: false, reason: 'INVALID_REQUEST' })
    expect(await send(relayMessage({ body: JSON.stringify({ question: '缺东西' }) })))
      .toEqual({ delivered: false, reason: 'INVALID_REQUEST' })
    expect(await send(relayMessage({ body: 'not json' })))
      .toEqual({ delivered: false, reason: 'INVALID_REQUEST' })
    expect(calls).toHaveLength(0)
  })

  it('端点不可达时报失败，而不是把异常抛给页面', async () => {
    const { send } = background([new Error('network down')])
    expect(await send(relayMessage({ body: JSON.stringify(body()) })))
      .toEqual({ delivered: false, reason: 'NETWORK_ERROR' })
  })

  it('与提问无关的消息不接，免得别的监听者收不到', async () => {
    const { calls, send } = background([])
    expect(await send({ action: 'SOMETHING_ELSE', request: { body: JSON.stringify(body()) } })).toBe(false)
    // 挂在我的 action 上却没有请求体：这是发给我的、但不成立，要明确回绝而不是装没看见。
    expect(await send({ action: ANALYSIS_ASK_RELAY_ACTION }))
      .toEqual({ delivered: false, reason: 'INVALID_REQUEST' })
    expect(calls).toHaveLength(0)
  })
})

describe('浮层这一侧的提问：复用侧边栏那条路', () => {
  const askThrough = async (
    answers: Array<{ status: number; body: string } | Error>,
    options: { timeoutMs?: number; question?: string } = {},
  ) => {
    const { calls, send } = background(answers)
    const result = await askAnalysis(options.question ?? '这个词位结构更依赖自然位还是广告位？', evidence, {
      fetcher: analysisFetchThroughBackground(send),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    })
    return { result, calls }
  }

  it('回答经中转回来，与直接提问得到的是同一种结果', async () => {
    const { result, calls } = await askThrough([{ status: 200, body: JSON.stringify(successBody) }])
    expect(result).toEqual({ kind: 'answer', response: successBody })
    // 出站请求体仍由 analysis-client 拼：壳只换了传输，没换契约。
    expect(JSON.parse(calls[0]!.init.body)).toMatchObject({
      schemaVersion: ANALYSIS_ASK_SCHEMA_VERSION,
      asin: evidence.asin,
      question: '这个词位结构更依赖自然位还是广告位？',
      evidence,
    })
  })

  it('越界回答沿用既有 UNSUPPORTED_SCOPE 语义与文案', async () => {
    const { result } = await askThrough([{
      status: 422,
      body: JSON.stringify({ ok: false, error: 'UNSUPPORTED_SCOPE', message: '这个问题超出可答范围。' }),
    }])
    expect(result).toEqual({ kind: 'unsupported-scope', message: '这个问题超出可答范围。' })
  })

  it('通道断了按失败处理，不把异常留给浮层', async () => {
    // background 没起来、或扩展刚更新完：消息发不出去（sendMessage 直接抛）。
    const result = await askAnalysis('问题', evidence, {
      fetcher: analysisFetchThroughBackground(async () => { throw new Error('Could not establish connection.') }),
    })
    expect(result).toEqual({ kind: 'failed', reason: 'AI 分析服务暂时不可用' })
  })

  it('background 报端点不可达时同样按失败处理', async () => {
    const { send } = background([new Error('network down')])
    const result = await askAnalysis('问题', evidence, { fetcher: analysisFetchThroughBackground(send) })
    expect(result).toEqual({ kind: 'failed', reason: 'AI 分析服务暂时不可用' })
  })

  it('中转卡住时按超时结束，输入不会一直等在「正在分析」上', async () => {
    let listener: ((message: unknown) => unknown) | null = null
    registerAnalysisAskRelay({
      runtime: { onMessage: { addListener(next) { listener = next } } },
      // 永不答复的中转：浏览器里对应的就是请求发出去之后再没有回音。
      fetch: () => new Promise(() => {}),
    })
    const fetcher = analysisFetchThroughBackground(async (message) => listener?.(message))
    await expect(askAnalysis('问题', evidence, { fetcher, timeoutMs: 1 }))
      .resolves.toEqual({ kind: 'failed', reason: '请求超时，请重试' })
  })
})
