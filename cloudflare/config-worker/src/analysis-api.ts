import {
  isAnalysisAskRequest,
  isAnalysisAskResponse,
  normalizeAnalysisViewSpec,
  type AnalysisAskResponse,
  type AnalysisAnswer,
  type AnalysisCitation,
  type AnalysisEvidence,
  type AnalysisFact,
  type AnalysisSource,
} from '@cookie-amazon/protocol'

export interface AnalysisEnv {
  ANALYSIS_API_BASE_URL?: string
  ANALYSIS_API_KEY?: string
  ANALYSIS_MODEL?: string
}

const ANALYSIS_PATH = '/api/analysis/ask'
const MAX_REQUEST_BYTES = 128 * 1024
const MAX_MODEL_RESPONSE_BYTES = 64 * 1024
const MODEL_TIMEOUT_MS = 20_000

const json = (body: AnalysisAskResponse, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const promptEndpoint = (baseUrl: string): string => {
  const base = baseUrl.replace(/\/+$/, '').replace(/\/v1\/(?:chat\/completions)$/i, '')
  return base.replace(/\/v1$/i, '') + '/v1/chat/completions'
}

const readBoundedBody = async (request: Request | Response, maxBytes: number): Promise<unknown> => {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await request.body?.cancel()
    throw new Error('BODY_TOO_LARGE')
  }
  if (!request.body) throw new Error('BODY_INVALID')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error('BODY_TOO_LARGE')
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new Error('BODY_INVALID')
  }
}

const textValue = (value: string | number | boolean | null): string =>
  value === null ? '未知' : typeof value === 'boolean' ? (value ? '是' : '否') : String(value)

const fact = (id: string, label: string, value: string | number | boolean | null, source: AnalysisSource): AnalysisFact => ({
  id, label, value: textValue(value), source,
})

export const buildFacts = (evidence: AnalysisEvidence): AnalysisFact[] => {
  const facts: AnalysisFact[] = [
    fact('object.asin', 'ASIN', evidence.asin, 'storefront'),
    fact('object.market', '站点', evidence.market, 'storefront'),
  ]
  const objectFields: Array<[keyof AnalysisEvidence['object'], string]> = [
    ['title', '前台标题'], ['price', '前台价格'], ['rating', '前台评分'], ['reviews', '前台评论数'], ['sponsored', '前台 Sponsored 标记'],
  ]
  for (const [key, label] of objectFields) {
    const value = evidence.object[key]
    if (value !== null) facts.push(fact('object.' + key, label, value, 'storefront'))
  }
  if (evidence.keyword) {
    const summary = evidence.keyword.summary
    facts.push(fact('keyword.summary.total', '关键词总数', summary.totalKeywords, 'derived'))
    facts.push(fact('keyword.summary.natural', '有自然排名的关键词数', summary.rankedKeywords, 'derived'))
    facts.push(fact('keyword.summary.ad', '有广告排名的关键词数', summary.adKeywords, 'derived'))
    for (const [index, row] of evidence.keyword.rows.entries()) {
      const prefix = 'keyword.row.' + index
      facts.push(fact(prefix + '.keyword', '关键词 ' + (index + 1), row.keyword, 'sellersprite'))
      facts.push(fact(prefix + '.natural', '关键词 ' + row.keyword + ' 自然位', row.natural, 'sellersprite'))
      facts.push(fact(prefix + '.ad', '关键词 ' + row.keyword + ' 广告位', row.ad, 'sellersprite'))
      facts.push(fact(prefix + '.naturalShare', '关键词 ' + row.keyword + ' 自然流量', row.naturalShare, 'sellersprite'))
      facts.push(fact(prefix + '.adShare', '关键词 ' + row.keyword + ' 广告流量', row.adShare, 'sellersprite'))
      facts.push(fact(prefix + '.types', '关键词 ' + row.keyword + ' 位置类型', row.types, 'sellersprite'))
      if (row.trend.kind === 'line') {
        facts.push(fact(prefix + '.trend', '关键词 ' + row.keyword + ' 搜索量趋势样本', row.trend.sampleCount, 'sellersprite'))
        for (const [index, point] of row.trend.segments.flat().entries()) {
          facts.push(fact(prefix + '.trend.' + index, '关键词 ' + row.keyword + ' ' + point.month + ' 搜索量', point.searches, 'sellersprite'))
        }
      }
    }
  }
  if (evidence.reviews) {
    facts.push(fact('reviews.sampled', '评论样本数', evidence.reviews.sampled, 'sellersprite'))
    facts.push(fact('reviews.total', '评论总数', evidence.reviews.total, 'sellersprite'))
    facts.push(fact('reviews.lowStar', '低星评论数', evidence.reviews.lowStarCount, 'derived'))
    facts.push(fact('reviews.coverage', '评论样本覆盖度', Math.round(evidence.reviews.coverage * 100) + '%', 'derived'))
    for (const [index, pain] of evidence.reviews.painPoints.entries()) {
      const prefix = 'reviews.pain.' + index
      facts.push(fact(prefix + '.label', '评论痛点 ' + (index + 1), pain.label, 'derived'))
      facts.push(fact(prefix + '.count', pain.label + ' 出现次数', pain.count, 'derived'))
      facts.push(fact(prefix + '.lowStarShare', pain.label + ' 低星占比', Math.round(pain.lowStarShare * 100) + '%', 'derived'))
    }
  }
  if (evidence.record) {
    facts.push(fact('record.owner', '研究记录作者', evidence.record.owner, 'research-record'))
    facts.push(fact('record.status', '研究记录状态', evidence.record.status, 'research-record'))
    if (evidence.record.summary) facts.push(fact('record.summary', '研究记录摘要', evidence.record.summary, 'research-record'))
  }
  return facts
}

/**
 * 越界判断必须抗住模型的「花样写法」，否则过滤只是摆设：
 * 全角字母（ＰＲＯＦＩＴ）、词中间塞零宽字符、用换行或 Markdown 加粗把一个词拆开
 * （利\n润、利**润**）都能绕过朴素的子串匹配，因此先归一化再匹配。
 *
 * 中文用去掉所有空白后的紧凑串（利 润 → 利润）；英文用词边界——
 * 证据里天然有 Costco 这类含 cost 的词，子串匹配会把合法回答一起毙掉。
 */
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\uFE0E\uFE0F]/g

const compactOf = (value: string): string =>
  value.normalize('NFKC').replace(ZERO_WIDTH, '').replace(/[*_`~]/g, '').replace(/\s+/g, '')

const spacedOf = (value: string): string =>
  value.normalize('NFKC').replace(ZERO_WIDTH, '').replace(/[*_`~]/g, ' ').replace(/\s+/g, ' ')

const OUT_OF_SCOPE_CJK = /利润|毛利|净利|成本|费用|运费|税费|合规|侵权|法律|合法|违法|稳赚|上架|值得投入|值得入场|值得做|能不能做|能不能卖|能做|不能做|能不能赚/
const OUT_OF_SCOPE_EN = /\b(?:profit|profits|profitability|margin|margins|cost|costs|fees?|compliance|compliant|legal|legally|illegal|viable|launch|launching)\b/i

/**
 * 范围声明本身必然包含「成本、利润、合规」，所以它要被允许——
 * 但只允许它原样独立出现：前面加「并非」或后面接「不过这个品能做」，
 * 含义就翻转成了判断，必须连同它一起拒绝。
 */
const SCOPE_BOUNDARY_STATEMENT =
  '当前证据仅支持前台、词位、评论和研究记录分析，无法判断成本、利润、法律合规或这个品能不能做。'

const boundaryCompact = compactOf(SCOPE_BOUNDARY_STATEMENT).replace(/[。.]$/, '')

/** 这句文字能进 prompt 与回答吗：只有「原样复述范围声明」或「不含越界用语」才放行。 */
export const isInScopeText = (value: string): boolean => {
  const compact = compactOf(value)
  if (compact.replace(/[。.]$/, '') === boundaryCompact) return true
  return !OUT_OF_SCOPE_CJK.test(compact) && !OUT_OF_SCOPE_EN.test(spacedOf(value))
}

export const forbiddenQuestion = (question: string): boolean => !isInScopeText(question)

const SYSTEM_PROMPT = '你是亚马逊美国站单个 ASIN 的研究助手。你只能根据用户提供的证据回答，不得补造数据。\n'
  + '把可直接从证据读出的内容放进 facts，把带有比较、原因、风险或下一步判断的内容放进 inferences。\n'
  + '每条回答至少引用一个真实的 citation ID；citation ID 必须逐字取自证据列表。数据缺失或冲突时，要在 facts 中明确写出“数据不足”或“字段冲突”，不要给确定结论。\n'
  + '不要回答利润、成本、费用、税费、合规、侵权或法律判断。若证据不足以判断这一点，直接复述这句：' + SCOPE_BOUNDARY_STATEMENT + '\n'
  + '只输出 JSON，不要 Markdown。\n'
  + 'JSON 格式：{"facts":["..."],"inferences":["..."],"citations":["object.asin"],"views":["object-summary","keyword-table"]}。\n'
  + 'views 只能从 object-summary、keyword-summary、keyword-table、keyword-trend、review-summary、review-pain-points、research-record 中选择；它们只是固定组件的选择，不是代码。'

const modelContent = (payload: unknown): string => {
  if (!isObject(payload) || !Array.isArray(payload.choices)) return ''
  const content = (payload.choices[0] as Record<string, unknown> | undefined)?.message
  if (!isObject(content)) return ''
  const raw = content.content
  if (typeof raw === 'string') return raw.trim()
  if (!Array.isArray(raw)) return ''
  return raw.flatMap((part) => isObject(part) && typeof part.text === 'string' ? [part.text] : []).join('\n').trim()
}

const parseModelJson = (content: string): Record<string, unknown> | null => {
  const fence = String.fromCharCode(96).repeat(3)
  let cleaned = content.trim()
  if (cleaned.startsWith(fence)) {
    cleaned = cleaned.slice(fence.length)
    if (cleaned.trimStart().startsWith('json')) cleaned = cleaned.trimStart().slice(4)
  }
  if (cleaned.trimEnd().endsWith(fence)) cleaned = cleaned.trimEnd().slice(0, -fence.length)
  try {
    const parsed = JSON.parse(cleaned.trim()) as unknown
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const parseModelAnswer = (payload: unknown, evidence: AnalysisEvidence): { answer: AnalysisAnswer; views: unknown } | null => {
  const parsed = parseModelJson(modelContent(payload))
  if (!parsed || !Array.isArray(parsed.facts) || !Array.isArray(parsed.inferences) || !Array.isArray(parsed.citations)) return null
  /**
   * 输出侧与输入侧用同一套越界判断：提示词只是请求，模型可能不照做，
   * 因此越界内容必须在解析处被丢弃——两种写法都要过滤，
   * 而且整体作废而不是剔除那一条：部分接受会让回答读起来像是「有边界」，
   * 实际上已经在给越界结论了。
   */
  const strings = (value: unknown[]): string[] | null => {
    const items = value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.length <= 1_000)
      .map((item) => item.trim())
      .slice(0, 8)
    return items.every((item) => isInScopeText(item)) ? items : null
  }
  const facts = strings(parsed.facts)
  const inferences = strings(parsed.inferences)
  if (facts === null || inferences === null) return null
  const ids = parsed.citations.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 128)
  const available = new Map(buildFacts(evidence).map((item) => [item.id, item]))
  const citations: AnalysisCitation[] = []
  for (const id of ids) {
    const citation = available.get(id)
    if (!citation || citations.some((item) => item.id === id)) return null
    citations.push(citation)
  }
  if (facts.length === 0 || citations.length === 0) return null
  return { answer: { facts, inferences, citations }, views: parsed.views }
}

const aiFailure = (message: string): Response => json({ ok: false, error: 'AI_UNAVAILABLE', message }, 503)

export const isAnalysisApiPath = (pathname: string): boolean => pathname === ANALYSIS_PATH

export const handleAnalysisApi = async (
  request: Request,
  env: AnalysisEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response> => {
  if (request.method !== 'POST') return json({ ok: false, error: 'BAD_REQUEST', message: '只支持 POST 请求' }, 405)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({ ok: false, error: 'BAD_REQUEST', message: '请求必须是 JSON' }, 400)
  }
  let parsed: unknown
  try {
    parsed = await readBoundedBody(request, MAX_REQUEST_BYTES)
  } catch (error) {
    const message = error instanceof Error && error.message === 'BODY_TOO_LARGE' ? '请求内容过大' : '请求 JSON 无效'
    return json({ ok: false, error: 'BAD_REQUEST', message }, 400)
  }
  if (!isAnalysisAskRequest(parsed)) return json({ ok: false, error: 'BAD_REQUEST', message: '分析请求字段无效' }, 400)
  if (forbiddenQuestion(parsed.question)) return json({ ok: false, error: 'UNSUPPORTED_SCOPE', message: '当前只能分析前台、词位、评论和研究记录，无法回答成本、利润或合规问题。' }, 422)
  if (!env.ANALYSIS_API_BASE_URL || !env.ANALYSIS_API_KEY) return aiFailure('AI 分析服务尚未配置')

  const facts = buildFacts(parsed.evidence)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)
  try {
    const response = await fetcher(promptEndpoint(env.ANALYSIS_API_BASE_URL), {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.ANALYSIS_API_KEY, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.ANALYSIS_MODEL || 'gpt-4.1-mini',
        temperature: 0,
        max_tokens: 1_400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify({ question: parsed.question, facts }) },
        ],
      }),
    })
    if (!response.ok) return aiFailure('AI 分析服务暂时不可用')
    const body = await readBoundedBody(response, MAX_MODEL_RESPONSE_BYTES)
    const parsedAnswer = parseModelAnswer(body, parsed.evidence)
    if (!parsedAnswer) return json({ ok: false, error: 'AI_RESPONSE_INVALID', message: 'AI 返回内容无法校验' }, 502)
    const view = normalizeAnalysisViewSpec({ views: parsedAnswer.views }, parsed.evidence)
    const result = { ok: true, answer: parsedAnswer.answer, view } as const
    if (!isAnalysisAskResponse(result)) return json({ ok: false, error: 'AI_RESPONSE_INVALID', message: 'AI 返回内容无法校验' }, 502)
    return json(result, 200)
  } catch (error) {
    if (error instanceof Error && (error.message === 'BODY_TOO_LARGE' || error.message === 'BODY_INVALID')) {
      return json({ ok: false, error: 'AI_RESPONSE_INVALID', message: error.message === 'BODY_TOO_LARGE' ? 'AI 返回内容过大' : 'AI 返回内容无法校验' }, 502)
    }
    console.error('Analysis API request failed', error)
    return aiFailure('AI 分析服务暂时不可用')
  } finally {
    clearTimeout(timeout)
  }
}

export { ANALYSIS_PATH, MAX_REQUEST_BYTES, promptEndpoint }
