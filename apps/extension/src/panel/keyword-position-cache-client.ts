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
import type { KeywordPositionCache } from './keyword-position-cache'
import { describeKeywordPositions } from './keyword-positions'
import { fetchKeywordReverse, type KeywordPositionResult } from './keyword-positions-client'

export type CachedKeywordPositionResult = KeywordPositionResult & {
  /** 这份数据是不是本地缓存给的。 */
  cached: boolean
  /** 命中缓存时距写入多久；未命中为 0。 */
  ageMs: number
}

type SendMessage = (message: unknown) => Promise<unknown>

export type CachedOptions = {
  send?: SendMessage
  cache: KeywordPositionCache
}

/**
 * 缓存的 payload 是 unknown，用之前必须自己确认形状。
 *
 * 只认得出 items 是数组就够——展示层会逐字段兜底缺失值，
 * 但若 items 本身不存在或不是数组，describeKeywordPositions 会抛错。
 * 那种坏数据当作没命中：宁可多拉一次，也不能让它冲到界面上。
 */
const asReverseData = (value: unknown): SellerSpriteKeywordReverseData | null => {
  if (typeof value !== 'object' || value === null) return null
  const { items } = value as { items?: unknown }
  if (!Array.isArray(items)) return null
  return value as SellerSpriteKeywordReverseData
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
      rows: describeKeywordPositions(data),
      cached: true,
      ageMs: cached.ageMs,
    }
  }
  const fresh = await fetchKeywordReverse(asin, market, {
    ...(options.send === undefined ? {} : { send: options.send }),
  })
  if (fresh.kind !== 'data') return { ...fresh, cached: false, ageMs: 0 }
  // 写失败只是这次没缓存上，结果照样给用户。
  await options.cache.write(asin, market, fresh.data)
  return { kind: 'rows', rows: describeKeywordPositions(fresh.data), cached: false, ageMs: 0 }
}
