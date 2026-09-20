import {
  ANALYSIS_ASK_PATH,
  REMOTE_CONFIG_ORIGIN,
  isAnalysisAskRequest,
} from '@cookie-amazon/protocol'

/**
 * 提问经 background 中转（#24）。
 *
 * 页面内浮层跑在 amazon.com 上，直连提问端点会被浏览器的同源策略挡掉——端点没有 CORS 头，
 * 而给 Worker 加 CORS 等于把端点对任意来源开放，收益相同、面更大。扩展的 manifest 里已经
 * 声明了这个域名的 host 权限，background 不受页面同源策略约束，所以由它代发。
 *
 * background 不是一条管道：端点、请求头与上限都是它自己定的，页面侧只能交一份请求体，
 * 多带任何字段整条拒掉。SSRF 的第一道闸就是「请求发到哪里不由请求方决定」。
 */
export const ANALYSIS_ASK_RELAY_ACTION = 'COOKIE_AMAZON_ANALYSIS_ASK'

/**
 * 请求体上限，按字节算——端点自己的上限（Worker 的 MAX_REQUEST_BYTES）也是按字节算的，
 * 这里若按 JS 字符串长度来量，中文一个字符算一个，字节数却可能是三倍。
 */
const MAX_RELAY_BODY_BYTES = 128 * 1024
const REQUEST_TIMEOUT_MS = 20_000

const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length

/** 中转的答复：只有这两种。正文与状态原样带回，让端点自己说为什么拒。 */
export type AnalysisAskRelayReply =
  | { delivered: true; status: number; body: string }
  | { delivered: false; reason: 'INVALID_REQUEST' | 'NETWORK_ERROR' }

export type AnalysisAskRelayFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; text: () => Promise<string> }>

export type AnalysisAskRelayApi = {
  runtime: { onMessage: { addListener(listener: (message: unknown) => unknown): void } }
  fetch: AnalysisAskRelayFetch
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * 认的是「这条消息是不是发给我的」，而不是「它是不是合规」。
 *
 * 两者分开：不合规的那条要**明确拒掉**（页面侧多带一个 URL 字段也必须知道没发出去），
 * 而返回 false 只是「这条不是我的」，浏览器会让别的监听者接着处理。
 */
const isRelayMessage = (value: unknown): value is { request?: unknown } =>
  isRecord(value) && (value as { action?: unknown }).action === ANALYSIS_ASK_RELAY_ACTION

const askBodyOf = (value: unknown): string | null => {
  if (!isRecord(value)) return null
  // 精确键校验：页面侧只能交请求体，URL、请求头、方法这些由 background 说了算。
  if (Object.keys(value).length !== 1) return null
  const { body } = value as { body?: unknown }
  return typeof body === 'string' && utf8Bytes(body) <= MAX_RELAY_BODY_BYTES ? body : null
}

/**
 * 交上来的请求体在这一处校验，随后原样发出——验证过的与发出去的是同一份字节。
 * 只在该请求体**不是**这个版本的提问请求时拒：越界与否是端点的判断，中转不改写结论。
 */
const isAskBody = (body: string): boolean => {
  try {
    return isAnalysisAskRequest(JSON.parse(body))
  } catch {
    return false
  }
}

const sendAsk = async (api: AnalysisAskRelayApi, body: string): Promise<AnalysisAskRelayReply> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await api.fetch(new URL(ANALYSIS_ASK_PATH, REMOTE_CONFIG_ORIGIN).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    })
    return { delivered: true, status: response.status, body: await response.text() }
  } catch {
    return { delivered: false, reason: 'NETWORK_ERROR' }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * background 侧注册。与既有的受限 action 同一个模式：认不出的消息返回 false，
 * 让别的监听者还能收到；异常在这里被翻成结果对象，不抛回页面。
 */
export const registerAnalysisAskRelay = (api: AnalysisAskRelayApi): void => {
  api.runtime.onMessage.addListener((message: unknown) => {
    if (!isRelayMessage(message)) return false
    const body = askBodyOf(message.request)
    if (body === null || !isAskBody(body)) return { delivered: false, reason: 'INVALID_REQUEST' } as const
    return sendAsk(api, body)
  })
}

/**
 * 浮层侧：把「经 background 提问」装成一个 fetcher，交给侧边栏用的同一个 askAnalysis。
 *
 * 这样浮层与侧边栏共用一套提示文案、超时与结果语义（含 UNSUPPORTED_SCOPE），
 * 换的只是传输——两处对同一件事给出同一个说法。
 */
export const analysisFetchThroughBackground = (
  send: (message: unknown) => Promise<unknown>,
): typeof fetch => async (_input, init) => {
  const request = { action: ANALYSIS_ASK_RELAY_ACTION, request: { body: String(init?.body ?? '') } }
  /**
   * 通道本身断了（background 没起来、扩展刚更新）时按网络失败结束：与直连发出的请求
   * 被挡在跨域之外是同一件事，调用方看到的都该是「服务不可用」而不是一个异常。
   */
  let reply: unknown
  try {
    // 超时的判定属于调用方（askAnalysis 的 signal）：中转卡住时这里也要跟着结束，
    // 否则浮层的输入会一直等在「正在分析」上。
    reply = await Promise.race([
      send(request),
      new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) { reject(new DOMException('aborted', 'AbortError')); return }
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      }),
    ])
  } catch (error: unknown) {
    // 超时要按超时结束（下一步是「重试」），不能翻成网络失败——两者给用户的下一步不同。
    if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError') throw error
    throw new TypeError('analysis ask relay unavailable')
  }
  if (typeof reply === 'object' && reply !== null && (reply as { delivered?: unknown }).delivered === true) {
    const { status, body } = reply as { status: number; body: string }
    return new Response(body, { status })
  }
  const reason = (reply as { reason?: unknown } | null)?.reason
  if (reason === 'NETWORK_ERROR') throw new TypeError('analysis ask endpoint unreachable')
  /**
   * 剩下的只有「中转没把这份请求发出去」（多半是本页的内容脚本还是旧版本）。
   *
   * 不能替端点编一个 BAD_REQUEST 出来：那会让用户以为模型拒了这个问题，
   * 而实际上这句话根本没到模型那里。按通道问题结束，调用方给的是传输失败的说法。
   */
  throw new TypeError('analysis ask relay refused the request')
}
