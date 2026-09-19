import type { StorageArea } from '../remote-config'

export const KEYWORD_POSITION_CACHE_STORAGE_KEY = 'keyword-position-cache:v1'

/** 24 小时。位置数据变了就是变了，超过一天的值不该再冒充现状。 */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1_000

export type KeywordPositionCacheRead<T> =
  | { hit: false }
  | { hit: true; data: T; ageMs: number }

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
    private readonly ttlMs: number = CACHE_TTL_MS,
  ) {}

  public async read<T>(asin: string, market: string): Promise<KeywordPositionCacheRead<T>> {
    const entry = await this.entry(keywordPositionCacheKey(asin, market))
    if (entry === null) return { hit: false }
    const ageMs = this.now() - entry.storedAt
    // 时钟回拨或未来时间戳一律当过期：宁可多拉一次，也不把可疑数据当现状。
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs >= this.ttlMs) return { hit: false }
    return { hit: true, data: entry.data as T, ageMs }
  }

  public async write(asin: string, market: string, data: unknown): Promise<boolean> {
    try {
      const stored = await this.allEntries()
      const now = this.now()
      const kept = Object.entries(stored)
        .filter(([, entry]) => now - entry.storedAt < this.ttlMs)
      const next = Object.fromEntries([...kept, [keywordPositionCacheKey(asin, market), { storedAt: now, data }]])
      await this.storage.set({ [KEYWORD_POSITION_CACHE_STORAGE_KEY]: next })
      return true
    } catch {
      return false
    }
  }

  private async allEntries(): Promise<Record<string, CacheEntry>> {
    try {
      const raw = (await this.storage.get(KEYWORD_POSITION_CACHE_STORAGE_KEY))[KEYWORD_POSITION_CACHE_STORAGE_KEY]
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

