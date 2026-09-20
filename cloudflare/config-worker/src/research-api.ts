/**
 * 小组研究记录的服务端。
 *
 * 存在的理由：扩展本地存储无法做跨浏览器共享，也无法做真正的组间隔离——
 * 记录和组名都躺在同一个浏览器里，任何能打开扩展的人都能读到别的组。
 * 这里把归属放在服务端：按访问密钥确定成员身份，查询一律按服务端小组限定。
 *
 * 密钥只以 sha256 摘要形式存在（RESEARCH_MEMBERS），明文从不落库、不记日志。
 */

export interface ResearchEnv {
  FASHION_DB: D1Database
  RESEARCH_MEMBERS?: string
}

export const RESEARCH_PATH = '/api/research' as const

const RESEARCH_STATUSES = ['researching', 'verified', 'rejected'] as const
type ResearchStatus = typeof RESEARCH_STATUSES[number]

type Member = { name: string; group: string; tokenHash: string }

type ResearchRecord = {
  asin: string
  market: string
  owner: string
  group: string
  status: ResearchStatus
  summary: string
  updatedAt: number
}

const MAX_BODY_BYTES = 16 * 1024
const MAX_SUMMARY_LENGTH = 500
const ASIN_PATTERN = /^[A-Z0-9]{10}$/
const CACHE_TTL_MS = 24 * 60 * 60_000
const MAX_CACHE_BYTES = 512 * 1024

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

export const isResearchApiPath = (pathname: string): boolean =>
  pathname === RESEARCH_PATH || pathname.startsWith(RESEARCH_PATH + '/')

const memberList = (env: ResearchEnv): Member[] => {
  const raw = env.RESEARCH_MEMBERS
  if (typeof raw !== 'string' || raw.length === 0) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry): Member[] => {
      if (typeof entry !== 'object' || entry === null) return []
      const { name, group, tokenHash } = entry as Record<string, unknown>
      const safeName = text(name)
      const safeGroup = text(group)
      const safeHash = text(tokenHash).toLowerCase()
      if (safeName.length === 0 || safeGroup.length === 0 || !/^[0-9a-f]{64}$/.test(safeHash)) return []
      return [{ name: safeName, group: safeGroup, tokenHash: safeHash }]
    })
  } catch {
    return []
  }
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * 用摘要比对而不是明文：一次遍历全部成员，不因匹配到第几个人而短路，
 * 免得从响应时间上看出密钥属于谁。
 */
const authenticate = async (request: Request, env: ResearchEnv): Promise<Member | null> => {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim() ?? ''
  if (token.length === 0) return null
  const hash = await sha256Hex(token)
  let found: Member | null = null
  for (const member of memberList(env)) {
    if (member.tokenHash === hash && found === null) found = member
  }
  return found
}
const readBody = async (request: Request): Promise<Record<string, unknown> | null> => {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null
  try {
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) return null
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

const toRecord = (row: Record<string, unknown> | null | undefined): ResearchRecord | null => {
  if (row === null || row === undefined) return null
  const asin = text(row.asin).toUpperCase()
  const market = text(row.market).toUpperCase()
  const owner = text(row.owner)
  const group = text(row.group_name)
  const status = text(row.status)
  const summary = typeof row.summary === 'string' ? row.summary : ''
  const updatedAt = Number(row.updated_at)
  if (!ASIN_PATTERN.test(asin) || market.length === 0 || owner.length === 0 || group.length === 0) return null
  if (!RESEARCH_STATUSES.includes(status as ResearchStatus)) return null
  if (!Number.isFinite(updatedAt)) return null
  return { asin, market, owner, group, status: status as ResearchStatus, summary, updatedAt }
}

const requireStatus = (value: unknown): ResearchStatus | null =>
  RESEARCH_STATUSES.includes(value as ResearchStatus) ? value as ResearchStatus : null

const SELECT_COLUMNS = 'asin, market, group_name, owner, status, summary, updated_at'

export const handleResearchApi = async (request: Request, env: ResearchEnv): Promise<Response> => {
  const member = await authenticate(request, env)
  if (member === null) return json({ ok: false, error: 'UNAUTHORIZED', message: '访问密钥无效或缺失' }, 401)

  const url = new URL(request.url)
  const suffix = url.pathname.slice(RESEARCH_PATH.length)

  if (suffix === '/keyword-positions' && (request.method === 'GET' || request.method === 'PUT')) {
    const asin = text(url.searchParams.get('asin')).toUpperCase()
    const market = text(url.searchParams.get('market')).toUpperCase()
    if (!ASIN_PATTERN.test(asin) || !/^[A-Z]{2,16}$/.test(market)) {
      return json({ ok: false, error: 'BAD_REQUEST', message: 'asin 或 market 无效' }, 400)
    }
    const now = Date.now()
    if (request.method === 'GET') {
      const row = await env.FASHION_DB.prepare(
        'SELECT payload, stored_at FROM keyword_position_cache WHERE asin = ? AND market = ? AND group_name = ? AND stored_at > ? AND stored_at <= ?',
      ).bind(asin, market, member.group, now - CACHE_TTL_MS, now).first<{ payload: ArrayBuffer; stored_at: number }>()
      if (row === null) return json({ ok: false, error: 'CACHE_MISS' }, 404)
      return new Response(new Uint8Array(row.payload), {
        headers: {
          'content-type': 'application/octet-stream',
          'cache-control': 'no-store',
          'x-cache-age-ms': String(now - row.stored_at),
        },
      })
    }
    const declared = Number(request.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_CACHE_BYTES) {
      return json({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413)
    }
    const reader = request.body?.getReader()
    const parts: Uint8Array[] = []
    let size = 0
    if (reader !== undefined) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_CACHE_BYTES) {
          await reader.cancel()
          return json({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413)
        }
        parts.push(value)
      }
    }
    const payload = new Uint8Array(size)
    let offset = 0
    for (const part of parts) { payload.set(part, offset); offset += part.byteLength }
    await env.FASHION_DB.prepare(
      'INSERT INTO keyword_position_cache (asin, market, group_name, payload, stored_at) VALUES (?, ?, ?, ?, ?)'
      + ' ON CONFLICT (asin, market, group_name) DO UPDATE SET payload = excluded.payload, stored_at = excluded.stored_at',
    ).bind(asin, market, member.group, payload, now).run()
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  }

  if (suffix === '/records' && request.method === 'GET') {
    const asin = text(url.searchParams.get('asin')).toUpperCase()
    const market = text(url.searchParams.get('market')).toUpperCase()
    if (!ASIN_PATTERN.test(asin) || market.length === 0) {
      return json({ ok: false, error: 'BAD_REQUEST', message: 'asin 与 market 必填' }, 400)
    }
    // 小组来自服务端身份，不来自查询参数：客户端不能自己挑看哪个组。
    const row = await env.FASHION_DB.prepare(
      'SELECT ' + SELECT_COLUMNS + ' FROM research_records WHERE asin = ? AND market = ? AND group_name = ?',
    ).bind(asin, market, member.group).first<Record<string, unknown>>()
    return json({ ok: true, record: toRecord(row) })
  }

  if (suffix === '/records' && request.method === 'PUT') {
    const body = await readBody(request)
    if (body === null) return json({ ok: false, error: 'BAD_REQUEST', message: '请求内容无效' }, 400)
    const asin = text(body.asin).toUpperCase()
    const market = text(body.market).toUpperCase()
    const status = requireStatus(body.status)
    const summary = typeof body.summary === 'string' ? body.summary.slice(0, MAX_SUMMARY_LENGTH) : ''
    if (!ASIN_PATTERN.test(asin) || market.length === 0 || status === null) {
      return json({ ok: false, error: 'BAD_REQUEST', message: 'asin、market 或 status 无效' }, 400)
    }
    // 归属取服务端身份：请求体里的 owner/group 一律不看，否则可以冒充别人。
    //
    // 一条语句完成写入与回读：ON CONFLICT 的 WHERE 保证只有作者本人能覆盖自己的记录，
    // 于是并发写入不会抢走归属，也不需要先读后写的两步竞态。
    const updatedAt = Date.now()
    const saved = await env.FASHION_DB.prepare(
      'INSERT INTO research_records (asin, market, group_name, owner, status, summary, updated_at)'
      + ' VALUES (?, ?, ?, ?, ?, ?, ?)'
      + ' ON CONFLICT (asin, market, group_name) DO UPDATE SET'
      + ' status = excluded.status, summary = excluded.summary, updated_at = excluded.updated_at'
      + ' WHERE research_records.owner = excluded.owner'
      + ' RETURNING ' + SELECT_COLUMNS,
    ).bind(asin, market, member.group, member.name, status, summary, updatedAt).first<Record<string, unknown>>()
    if (saved === null || saved === undefined) {
      return json({ ok: false, error: 'FORBIDDEN', message: '这条记录由同组其他成员维护，只有作者本人能改' }, 403)
    }
    return json({ ok: true, record: toRecord(saved) })
  }

  return json({ ok: false, error: 'NOT_FOUND', message: '未知的研究记录接口' }, 404)
}
