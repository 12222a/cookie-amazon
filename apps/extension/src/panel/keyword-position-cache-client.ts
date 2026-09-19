/**
 * 带缓存的词位取数。
 *
 * 包在取数通道外层而不是改它：那条通道只负责组装请求与翻译错误，
 * 缓存是另一件事（什么时候能复用、能复用多久），分开才好各自测试。
 *
 * 缓存的是**原始响应**，因此跨人复用安全——它与「谁在看」无关。
 * 只有成功的取数才写入：把失败缓存下来，用户点重试会永远拿到同一个失败。
 */
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

export const requestKeywordPositionsCached = async (
  asin: string,
  market: string,
  options: CachedOptions,
): Promise<CachedKeywordPositionResult> => {
  const cached = await options.cache.read<Parameters<typeof describeKeywordPositions>[0]>(asin, market)
  if (cached.hit) {
    return {
      kind: 'rows',
      rows: describeKeywordPositions(cached.data),
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

