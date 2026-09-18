/**
 * 分析对象：面板当前正在看的那个东西。
 *
 * 它有两个来源——亚马逊搜索页的选中（亚马逊侧写入）、手动输入 ASIN（面板侧写入）——
 * 因此存储契约由本文件定义，两侧都只依赖它。
 */

export type AnalysisSource = 'manual' | 'storefront'

/** 前台页面上可见的字段。缺失一律为 null，不用 0 或空串替代。 */
export type StorefrontFields = {
  title: string | null
  price: number | null
  rating: number | null
  reviews: number | null
  sponsored: boolean | null
}

export type AnalysisObject = {
  asin: string
  market: string
  source: AnalysisSource
  storefront: StorefrontFields | null
  owner: string | null
  group: string | null
  createdAt: number
}

export type CreateAnalysisObjectInput = {
  asin: string
  market: string
  source: AnalysisSource
  owner?: string | null
  group?: string | null
  storefront?: StorefrontFields | null
  now?: number
}

const ASIN_PATTERN = /^[A-Z0-9]{10}$/

/** 合法 ASIN 返回大写形式，否则返回 null。不抛错——输入来自人手。 */
export const normalizeAsin = (value: string): string | null => {
  const normalized = value.trim().toUpperCase()
  return ASIN_PATTERN.test(normalized) ? normalized : null
}

const optionalText = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export const createAnalysisObject = (input: CreateAnalysisObjectInput): AnalysisObject | null => {
  const asin = normalizeAsin(input.asin)
  if (asin === null) return null
  const market = optionalText(input.market)
  if (market === null) return null
  return {
    asin,
    market: market.toUpperCase(),
    source: input.source,
    storefront: input.storefront ?? null,
    owner: optionalText(input.owner),
    group: optionalText(input.group),
    createdAt: input.now ?? Date.now(),
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStorefrontFields = (value: unknown): value is StorefrontFields =>
  isRecord(value)
  && (value.title === null || typeof value.title === 'string')
  && (value.price === null || typeof value.price === 'number')
  && (value.rating === null || typeof value.rating === 'number')
  && (value.reviews === null || typeof value.reviews === 'number')
  && (value.sponsored === null || typeof value.sponsored === 'boolean')

/** 存储里的东西可能是旧版本或被人改过，读之前一律校验，不让面板拿到半个对象。 */
export const isAnalysisObject = (value: unknown): value is AnalysisObject => {
  if (!isRecord(value)) return false
  if (typeof value.asin !== 'string' || !ASIN_PATTERN.test(value.asin)) return false
  if (typeof value.market !== 'string' || value.market.length === 0) return false
  if (value.source !== 'manual' && value.source !== 'storefront') return false
  if (value.storefront !== null && !isStorefrontFields(value.storefront)) return false
  if (value.owner !== null && typeof value.owner !== 'string') return false
  if (value.group !== null && typeof value.group !== 'string') return false
  return typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
}

