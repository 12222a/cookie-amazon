/**
 * 搜索结果卡片的解析与选中对象构造。
 *
 * 这里只做纯字符串处理，不碰 document：亚马逊侧的注入脚本把它作用于真实 DOM 节点，
 * 测试直接喂固定 HTML 片段。改版导致结构变化时，解析返回空值而不是抛错——
 * 页面照常浏览，只是没有卡片可点。
 */
import {
  createAnalysisObject,
  DEFAULT_MARKET,
  type AnalysisObject,
  type StorefrontFields,
} from '../analysis-object'
export const SEARCH_RESULT_CARD_SELECTOR = '[data-component-type="s-search-result"]'
export type SearchResultCard = {
  asin: string
  title: string | null
  price: number | null
  rating: number | null
  reviews: number | null
  sponsored: boolean
}
const CARD_PATTERN = /<(\w+)\b[^>]*data-component-type="s-search-result"[^>]*>([\s\S]*?)<\/\1>/gi
const ASIN_IN_OPEN_TAG = /data-asin="([^"]*)"/i

/** 越界或非法的数字实体一律留空，不让一截图里的怪 entity 把整页解析掀翻。 */
const safeCodePoint = (value: number): string =>
  Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : ''

const decodeEntities = (value: string): string => value
  .replace(/&#(\d+);/g, (_, code: string) => safeCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => safeCodePoint(Number.parseInt(code, 16)))
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
const plainText = (value: string): string => decodeEntities(value
  .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, ' ')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ')
  .trim()
const firstMatch = (value: string, pattern: RegExp): string | null =>
  value.match(pattern)?.[1] ?? null
const readTitle = (body: string): string | null => {
  const raw = firstMatch(body, /<h2\b[^>]*>([\s\S]*?)<\/h2>/i)
  if (raw === null) return null
  const text = plainText(raw)
  return text.length === 0 ? null : text
}
/**
 * 价格取 30.00 这种机器可读形式，优先整个卡片里第一个价格块；
 * 千分位分隔符要剥掉，否则 1,234.50 会被读成 1。
 */
const readPrice = (body: string): number | null => {
  const offscreen = firstMatch(body, /<span\b[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
  const raw = offscreen ?? firstMatch(body, /<span\b[^>]*class="[^"]*a-price-whole[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
  if (raw === null) return null
  const match = plainText(raw).match(/\d[\d,]*(?:\.\d+)?/)
  if (match === null) return null
  const value = Number(match[0].replaceAll(',', ''))
  return Number.isFinite(value) ? value : null
}
const readRating = (body: string): number | null => {
  const raw = firstMatch(body, /<span\b[^>]*class="[^"]*a-icon-alt[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
  if (raw === null) return null
  const match = plainText(raw).match(/(\d(?:[.,]\d)?)\s*(?:out of|von|de|sur)\s*5/i)
  const captured = match?.[1]
  if (captured === undefined) return null
  const value = Number(captured.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}
/** 评论数允许有千分位与 aria-label 包装，取第一个看起来像计数的数字。 */
const readReviews = (body: string): number | null => {
  const raw = firstMatch(body, /(?:aria-label="([^"]*?ratings?[^"]*)"|(\d[\d,]*)\s*(?:ratings?|reviews?|Bewertungen))/i)
  const text = raw === null ? null : plainText(raw)
  const match = (text ?? firstMatch(body, /aria-label="([^"]*?[\d,]+[^"]*?)"/i) ?? '').match(/\d[\d,]*/)
  if (match === null) return null
  const value = Number(match[0].replaceAll(',', ''))
  return Number.isFinite(value) ? value : null
}
const readSponsored = (body: string): boolean => {
  const text = plainText(body)
  return /\bSponsored\b/i.test(text) || /\bGesponsert\b/i.test(text) || /赞助/i.test(text)
}
/** 单个卡片片段的读取。缺任何字段都返回 null，不猜。 */
const parseCard = (openTag: string, body: string): SearchResultCard | null => {
  const asin = (openTag.match(ASIN_IN_OPEN_TAG)?.[1] ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{10}$/.test(asin)) return null
  return {
    asin,
    title: readTitle(body),
    price: readPrice(body),
    rating: readRating(body),
    reviews: readReviews(body),
    sponsored: readSponsored(body),
  }
}
/**
 * 从一段 HTML 里切出所有搜索结果卡片。
 *
 * 用跟卖家精灵那侧一致的正则切片方式，不引入 DOM 依赖：
 * 解析发生在注入脚本里（那里有真实 document）与测试里（纯字符串），两边行为一致。
 */
export const parseSearchResultCards = (html: string): SearchResultCard[] => {
  if (typeof html !== 'string' || html.length === 0) return []
  const cards: SearchResultCard[] = []
  for (const match of html.matchAll(CARD_PATTERN)) {
    const card = parseCard(match[0].slice(0, match[0].indexOf('>') + 1), match[2] ?? '')
    if (card !== null) cards.push(card)
  }
  return cards
}
/**
 * 一个字段都没读出来时报告「没读到」（null），而不是一个全空的 storefront：
 * 后者会谎称我们看清了这张卡片。sponsored 是从文本猜的，默认 false，不能当作读到的证据。
 */
const toStorefrontFields = (card: SearchResultCard | null): StorefrontFields | null => {
  if (card === null) return null
  if (card.title === null && card.price === null && card.rating === null && card.reviews === null) return null
  return {
    title: card.title,
    price: card.price,
    rating: card.rating,
    reviews: card.reviews,
    sponsored: card.sponsored,
  }
}
/**
 * 由「用户点了哪个 ASIN」构造分析对象。
 *
 * 关键取舍：卡片读不出来时**仍然返回对象**，storefront 记为 null。
 * 用户确实点了一个商品，只是我们读不懂它的字段；把这次点击丢掉比缺字段更糟。
 */
export const createStorefrontSelection = (
  asin: string,
  cardMarkup: string | null,
  options: { market?: string; now?: number } = {},
): AnalysisObject | null => {
  const card = typeof cardMarkup === 'string'
    ? parseSearchResultCards(`<div data-component-type="s-search-result" data-asin="${asin}">${cardMarkup}</div>`)[0] ?? null
    : null
  return createAnalysisObject({
    asin,
    market: options.market ?? DEFAULT_MARKET,
    source: 'storefront',
    storefront: toStorefrontFields(card),
    ...(options.now === undefined ? {} : { now: options.now }),
  })
}
