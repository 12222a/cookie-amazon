/**
 * 研究记录的服务端客户端。
 *
 * 记录不再落在扩展本地存储：本地存储做不到跨浏览器共享，也做不到组间隔离——
 * 同一浏览器里任何人打开扩展都能读到别的组。因此读写都走 Worker，
 * 身份由访问密钥在服务端确定，客户端提交 owner/group 没有意义。
 *
 * 服务不可用或未认证时**不退回本地数据**：那会把「读不到」伪装成「没人研究过」，
 * 用户会据此重复劳动，而隔离本身也已经失效。
 */
import { REMOTE_CONFIG_ORIGIN } from '@cookie-amazon/protocol'
import { RESEARCH_STATUSES, type ResearchStatus } from '../research-record'

export type ResearchRecordPayload = {
  asin: string
  market: string
  status: ResearchStatus
  summary: string
}

export type ServerResearchRecord = ResearchRecordPayload & {
  owner: string
  group: string
  updatedAt: number
}

export type ResearchRecordResult =
  | { kind: 'none' }
  | { kind: 'found'; record: ServerResearchRecord }
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden'; message: string }
  | { kind: 'unavailable' }

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const defaultFetch: Fetcher = (input, init) => fetch(input, init)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asRecord = (value: unknown): ServerResearchRecord | null => {
  if (!isRecord(value)) return null
  const { asin, market, owner, group, status, summary, updatedAt } = value
  if (typeof asin !== 'string' || typeof market !== 'string') return null
  if (typeof owner !== 'string' || typeof group !== 'string') return null
  if (status !== 'researching' && status !== 'verified' && status !== 'rejected') return null
  if (typeof summary !== 'string' || typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return null
  return { asin, market, owner, group, status, summary, updatedAt }
}

const messageOf = (body: unknown): string =>
  isRecord(body) && typeof body.message === 'string' ? body.message : ''

export class ResearchRecordClient {
  public constructor(private readonly options: {
    origin?: string
    token: string
    fetcher?: Fetcher
  }) {}

  private endpoint(query = ''): string {
    return new URL('/api/research/records' + query, this.options.origin ?? REMOTE_CONFIG_ORIGIN).toString()
  }

  private headers(): HeadersInit {
    return { authorization: 'Bearer ' + this.options.token, 'content-type': 'application/json' }
  }

  public async find(asin: string, market: string): Promise<ResearchRecordResult> {
    if (this.options.token.trim().length === 0) return { kind: 'unauthenticated' }
    const query = '?asin=' + encodeURIComponent(asin) + '&market=' + encodeURIComponent(market)
    try {
      const response = await (this.options.fetcher ?? defaultFetch)(this.endpoint(query), {
        method: 'GET',
        headers: this.headers(),
        credentials: 'omit',
        cache: 'no-store',
      })
      if (response.status === 401) return { kind: 'unauthenticated' }
      if (!response.ok) return { kind: 'unavailable' }
      const body = await response.json() as unknown
      if (!isRecord(body) || body.ok !== true) return { kind: 'unavailable' }
      if (body.record === null) return { kind: 'none' }
      const record = asRecord(body.record)
      return record === null ? { kind: 'unavailable' } : { kind: 'found', record }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  public async save(payload: ResearchRecordPayload): Promise<ResearchRecordResult> {
    if (this.options.token.trim().length === 0) return { kind: 'unauthenticated' }
    try {
      const response = await (this.options.fetcher ?? defaultFetch)(this.endpoint(), {
        method: 'PUT',
        headers: this.headers(),
        credentials: 'omit',
        cache: 'no-store',
        // 只发业务字段：归属人由服务端按密钥决定。
        body: JSON.stringify({
          asin: payload.asin,
          market: payload.market,
          status: payload.status,
          summary: payload.summary,
        }),
      })
      if (response.status === 401) return { kind: 'unauthenticated' }
      const body = await response.json().catch(() => null) as unknown
      if (response.status === 403) return { kind: 'forbidden', message: messageOf(body) }
      if (!response.ok) return { kind: 'unavailable' }
      if (!isRecord(body) || body.ok !== true) return { kind: 'unavailable' }
      const record = asRecord(body.record)
      return record === null ? { kind: 'unavailable' } : { kind: 'found', record }
    } catch {
      return { kind: 'unavailable' }
    }
  }
}

/** 把结果翻译成界面提示；无事发生的两种情况返回 null。 */
export const describeRecordResult = (result: ResearchRecordResult): string | null => {
  if (result.kind === 'unauthenticated') return '研究记录需要访问密钥：请向管理员索取后填入上方。'
  if (result.kind === 'unavailable') return '暂时无法连接研究记录服务，当前显示可能不是最新状态。'
  if (result.kind === 'forbidden') return result.message.length > 0 ? result.message : '这条记录由同组其他成员维护，只有作者本人能改。'
  return null
}
