import type { StorageArea } from '../remote-config'
import { REMOTE_CONFIG_ORIGIN } from '@cookie-amazon/protocol'

export const KEYWORD_POSITION_CACHE_STORAGE_KEY = 'keyword-position-cache:v1'

/** 24 小时。位置数据变了就是变了，超过一天的值不该再冒充现状。 */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1_000

/**
 * 命中时返回的 payload 是 unknown，不是调用方指定的 T。
 *
 * 存储是信任边界：写进去的可能是旧版本、被改过、或另一半代码留下的东西。
 * 若在这里断言成 T，坏数据要等到很远的展示层才炸；交给调用方用校验函数收窄，
 * 类型系统就会逼着它处理「数据不可用」这一支。
 */
export type KeywordPositionCacheRead =
  | { hit: false }
  | { hit: true; data: unknown; ageMs: number }

type CacheEntry = { storedAt: number; data: unknown }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readEntry = (value: unknown): CacheEntry | null => {
  if (!isRecord(value)) return null
  const { storedAt, data } = value as { storedAt?: unknown; data?: unknown }
  if (typeof storedAt !== 'number' || !Number.isFinite(storedAt)) return null
  if (data === undefined) return null
  return { storedAt, data }
}

/**
 * 缓存键：ASIN + 市场。
 *
 * 归一化大小写与空白，否则 B07Z82895W 和 b07z82895w 会各占一个槽位，
 * 同一份数据被拉两次——这正是缓存要避免的事。
 */
export const keywordPositionCacheKey = (asin: string, market: string): string =>
  `${asin.trim().toUpperCase()}@${market.trim().toUpperCase()}`

/**
 * 词位取数的本地缓存。
 *
 * 目的有两个：重复查看同一个 ASIN 时不再等一次往返，以及不再重复消耗卖家精灵配额。
 * 因此缓存的是**原始响应**——它与谁在看无关，跨人复用是安全的；
 * 个人备注一类的东西不在这里，它们按人隔离在别处。
 *
 * 过期条目在写入时顺手清掉：本地存储有额度，一个只增不减的表迟早写不进去。
 * 读写失败一律降级为「没命中」或「没写成」，绝不打断面板——缓存是加速手段，不是必需品。
 */
export class KeywordPositionCache {
  public constructor(
    private readonly storage: StorageArea,
    private readonly now: () => number = Date.now,
    private readonly token = '',
  ) {}

  private async storageKey(): Promise<string> {
    if (this.token.length === 0) return KEYWORD_POSITION_CACHE_STORAGE_KEY
    // ponytail: v1 没有小组来源，无法安全迁入身份分槽；升级后首次查询可能重新取数。
    // 要做无损迁移，得先给旧条目补上小组归属——那需要一次服务端查询，等于把这次取数提前。
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.token))
    const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    return 'keyword-position-cache:v2:' + hash
  }

  public async read(asin: string, market: string): Promise<KeywordPositionCacheRead> {
    const entry = await this.entry(keywordPositionCacheKey(asin, market))
    if (entry === null) return { hit: false }
    const ageMs = this.now() - entry.storedAt
    // 时钟回拨或未来时间戳一律当过期：宁可多拉一次，也不把可疑数据当现状。
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs >= CACHE_TTL_MS) return { hit: false }
    return { hit: true, data: entry.data, ageMs }
  }

  public async write(asin: string, market: string, data: unknown, ageMs = 0): Promise<boolean> {
    try {
      const stored = await this.allEntries()
      const now = this.now()
      const kept = Object.entries(stored)
        .filter(([, entry]) => now - entry.storedAt < CACHE_TTL_MS)
      const next = Object.fromEntries([...kept, [keywordPositionCacheKey(asin, market), { storedAt: now - ageMs, data }]])
      await this.storage.set({ [await this.storageKey()]: next })
      return true
    } catch {
      return false
    }
  }

  private async allEntries(): Promise<Record<string, CacheEntry>> {
    try {
      const key = await this.storageKey()
      const raw = (await this.storage.get(key))[key]
      if (!isRecord(raw)) return {}
      const entries: Record<string, CacheEntry> = {}
      for (const [key, value] of Object.entries(raw)) {
        const entry = readEntry(value)
        if (entry !== null) entries[key] = entry
      }
      return entries
    } catch {
      return {}
    }
  }

  private async entry(key: string): Promise<CacheEntry | null> {
    return (await this.allEntries())[key] ?? null
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * 服务端往返的上限。没有它，一个不响应的 Worker 会让面板永远停在「正在读取…」，
 * 而这条路径的承诺是「服务端不可用就退回本地」——超时是「不可用」的一种。
 */
export const SERVER_CACHE_TIMEOUT_MS = 5_000

/** 服务端只保管字节；读取后仍由调用方校验卖家精灵响应形状。 */
export class ServerKeywordPositionCache {
  public constructor(private readonly options: { token: string; origin?: string; fetcher?: Fetcher }) {}

  private endpoint(asin: string, market: string): string {
    const url = new URL('/api/research/keyword-positions', this.options.origin ?? REMOTE_CONFIG_ORIGIN)
    url.searchParams.set('asin', asin.trim().toUpperCase())
    url.searchParams.set('market', market.trim().toUpperCase())
    return url.toString()
  }

  private async request(asin: string, market: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SERVER_CACHE_TIMEOUT_MS)
    try {
      return await (this.options.fetcher ?? fetch)(this.endpoint(asin, market), {
        ...init,
        headers: { authorization: 'Bearer ' + this.options.token, ...init.headers },
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  public async read(asin: string, market: string): Promise<KeywordPositionCacheRead> {
    if (this.options.token.trim().length === 0) return { hit: false }
    try {
      const response = await this.request(asin, market, { method: 'GET' })
      if (!response.ok) return { hit: false }
      const ageHeader = response.headers.get('x-cache-age-ms')
      if (ageHeader === null) return { hit: false }
      const ageMs = Number(ageHeader)
      // 只确认表头本身可用：24 小时的有效期由服务端判定（#26），
      // 客户端再按本地常量判一次，两边一旦不一致就会静默地把共享缓存关掉。
      if (!Number.isFinite(ageMs) || ageMs < 0) return { hit: false }
      return { hit: true, data: await response.json() as unknown, ageMs }
    } catch {
      return { hit: false }
    }
  }

  public async write(asin: string, market: string, data: unknown): Promise<boolean> {
    if (this.options.token.trim().length === 0) return false
    try {
      const response = await this.request(asin, market, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      })
      return response.ok
    } catch {
      return false
    }
  }
}
