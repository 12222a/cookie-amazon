import {
  ANALYSIS_ASK_PATH,
  ANALYSIS_ASK_SCHEMA_VERSION,
  REMOTE_CONFIG_ORIGIN,
  isAnalysisAskResponse,
  normalizeAnalysisViewSpec,
  toAnalysisHistory,
  type AnalysisHistoryTurn,
  type AnalysisAskRequest,
  type AnalysisAskResponse,
  type AnalysisEvidence,
} from '@cookie-amazon/protocol'

const REQUEST_TIMEOUT_MS = 20_000
// ponytail: retain view choices for the 20 most recent evidence bundles in this panel session;
// persistent cross-session stability would require a versioned storage cache.
const viewChoices = new Map<string, Extract<AnalysisAskResponse, { ok: true }>['view']>()

export type AnalysisResult =
  | { kind: 'answer'; response: Extract<AnalysisAskResponse, { ok: true }> }
  | { kind: 'unsupported-scope'; message: string }
  | { kind: 'failed'; reason: string }

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const defaultFetch: Fetcher = (input, init) => fetch(input, init)

const failureFromResponse = async (response: Response): Promise<AnalysisResult> => {
  try {
    const body = await response.json() as unknown
    if (isAnalysisAskResponse(body) && !body.ok) return body.error === 'UNSUPPORTED_SCOPE'
      ? { kind: 'unsupported-scope', message: body.message }
      : { kind: 'failed', reason: body.message }
  } catch {
    // The status itself is enough for the user-facing fallback below.
  }
  return { kind: 'failed', reason: response.status >= 500 ? 'AI 分析服务暂时不可用' : 'AI 分析请求失败' }
}

export const askAnalysis = async (
  question: string,
  evidence: AnalysisEvidence,
  options: { fetcher?: Fetcher; timeoutMs?: number; history?: readonly AnalysisHistoryTurn[] } = {},
): Promise<AnalysisResult> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS)
  /**
   * 只带最近几轮的问答文本，超出从最早处截断，并把「已经截断」这件事一并送出去。
   * 截断是发送端的责任：服务端见到超限只会拒绝，不替调用方决定丢掉哪一轮。
   */
  const history = toAnalysisHistory(options.history ?? [])
  const body: AnalysisAskRequest = {
    schemaVersion: ANALYSIS_ASK_SCHEMA_VERSION,
    asin: evidence.asin,
    market: evidence.market,
    question: question.trim(),
    evidence,
    history,
  }
  try {
    const response = await (options.fetcher ?? defaultFetch)(new URL(ANALYSIS_ASK_PATH, REMOTE_CONFIG_ORIGIN), {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      return await failureFromResponse(response)
    }
    const parsed = await response.json() as unknown
    if (!isAnalysisAskResponse(parsed)) return { kind: 'failed', reason: 'AI 返回内容无法校验' }
    if (!parsed.ok) {
      return parsed.error === 'UNSUPPORTED_SCOPE'
        ? { kind: 'unsupported-scope', message: parsed.message }
        : { kind: 'failed', reason: parsed.message }
    }
    const evidenceKey = JSON.stringify(evidence)
    const view = viewChoices.get(evidenceKey) ?? normalizeAnalysisViewSpec(parsed.view, evidence)
    viewChoices.set(evidenceKey, view)
    if (viewChoices.size > 20) viewChoices.delete(viewChoices.keys().next().value!)
    return { kind: 'answer', response: { ...parsed, view } }
  } catch (error) {
    return { kind: 'failed', reason: error instanceof DOMException && error.name === 'AbortError' ? '请求超时，请重试' : 'AI 分析服务暂时不可用' }
  } finally {
    clearTimeout(timeout)
  }
}
