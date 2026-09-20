/**
 * 带缓存的词位取数。
 *
 * 包在取数通道外层而不是改它：那条通道只负责组装请求与翻译错误，
 * 缓存是另一件事（什么时候能复用、能复用多久），分开才好各自测试。
 *
 * 缓存的是**原始响应**，因此跨人复用安全——它与「谁在看」无关。
 * 只有成功的取数才写入：把失败缓存下来，用户点重试会永远拿到同一个失败。
 */
import type { SellerSpriteKeywordReverseData } from '@cookie-amazon/protocol'
import type { KeywordPositionCache, ServerKeywordPositionCache } from './keyword-position-cache'
import { describeKeywordPositionSummary, describeKeywordPositions, type KeywordPositionSummary } from './keyword-positions'
import { fetchKeywordReverse, type KeywordPositionResult } from './keyword-positions-client'

type CacheMetadata = {
  /** 这份数据是否来自本地或服务端缓存。 */
  cached: boolean
  /** 命中缓存时距写入多久；未命中为 0。 */
  ageMs: number
  source: 'local' | 'server' | 'fresh'
}

export type CachedKeywordPositionResult =
  | ({ kind: 'rows'; rows: ReturnType<typeof describeKeywordPositions>; summary: KeywordPositionSummary } & CacheMetadata)
  | (Exclude<KeywordPositionResult, { kind: 'rows' }> & CacheMetadata)

type SendMessage = (message: unknown) => Promise<unknown>

export type CachedOptions = {
  send?: SendMessage
  cache: KeywordPositionCache
  server?: ServerKeywordPositionCache
}

/**
 * 缓存的 payload 是 unknown，用之前必须自己确认形状。
 *
 * 展示层能兜底缺失字段；不符合其可读形状的缓存当作未命中。
 */
const asReverseData = (value: unknown): {
  data: SellerSpriteKeywordReverseData
  rows: ReturnType<typeof describeKeywordPositions>
  summary: KeywordPositionSummary
} | null => {
  if (typeof value !== 'object' || value === null) return null
  const { items } = value as { items?: unknown }
  if (!Array.isArray(items)) return null
  try {
    const data = value as SellerSpriteKeywordReverseData
    return { data, rows: describeKeywordPositions(data), summary: describeKeywordPositionSummary(data) }
  } catch {
    return null
  }
}

export const requestKeywordPositionsCached = async (
  asin: string,
  market: string,
  options: CachedOptions,
): Promise<CachedKeywordPositionResult> => {
  const cached = await options.cache.read(asin, market)
  const data = cached.hit ? asReverseData(cached.data) : null
  if (cached.hit && data !== null) {
    return {
      kind: 'rows',
      rows: data.rows,
      summary: data.summary,
      cached: true,
      ageMs: cached.ageMs,
      source: 'local',
    }
  }
  const shared = await options.server?.read(asin, market)
  const sharedData = shared?.hit ? asReverseData(shared.data) : null
  if (shared?.hit && sharedData !== null) {
    await options.cache.write(asin, market, sharedData.data, shared.ageMs)
    return {
      kind: 'rows',
      rows: sharedData.rows,
      summary: sharedData.summary,
      cached: true,
      ageMs: shared.ageMs,
      source: 'server',
    }
  }
  const fresh = await fetchKeywordReverse(asin, market, {
    ...(options.send === undefined ? {} : { send: options.send }),
  })
  if (fresh.kind !== 'data') return { ...fresh, cached: false, ageMs: 0, source: 'fresh' }
  // 写失败只是这次没缓存上，结果照样给用户。
  await options.cache.write(asin, market, fresh.data)
  await options.server?.write(asin, market, fresh.data)
  return {
    kind: 'rows',
    rows: describeKeywordPositions(fresh.data),
    summary: describeKeywordPositionSummary(fresh.data),
    cached: false,
    ageMs: 0,
    source: 'fresh',
  }
}
