/**
 * 搜索结果卡片的解析与选中对象构造。
 *
 * 用原生 DOMParser 读取脱离页面的 HTML 片段，不修改亚马逊页面。
 * 改版导致结构变化时，解析返回空值而不是抛错——
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
const countFrom = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined) return null
  const match = value.match(/\d[\d,]*/)
  if (match === null) return null
  const value2 = Number(match[0].replaceAll(',', ''))
  return Number.isFinite(value2) ? value2 : null
}

const RATING_WORD = /ratings?|reviews?|Bewertungen/i

/**
 * 评论数只从「像评论数的地方」读：指向评论区的链接，或标签里带 ratings/reviews 字样的元素。
 *
 * 不能退化成「卡片里第一个带数字的 aria-label」——那会把 `4.5 out of 5 stars` 读成 4 条评论、
 * 把 `FREE delivery Tue, Sep 23` 读成 23 条。读不到就是 null，宁缺勿猜。
 */
const readReviews = (element: Element): number | null => {
  const linked = element.querySelector('a[href*="customerReviews"], a[href*="/product-reviews/"]')
  const fromLink = countFrom(linked?.getAttribute('aria-label')) ?? countFrom(linked?.textContent)
  if (fromLink !== null) return fromLink

  for (const candidate of element.querySelectorAll('[aria-label]')) {
    const label = candidate.getAttribute('aria-label')
    if (label !== null && RATING_WORD.test(label)) {
      const value = countFrom(label)
      if (value !== null) return value
    }
  }

  const inline = firstMatch(element.innerHTML, /(\d[\d,]*)\s*(?:ratings?|reviews?|Bewertungen)/i)
  return countFrom(inline)
}
const readSponsored = (body: string): boolean => {
  const text = plainText(body)
  return /\bSponsored\b/i.test(text) || /\bGesponsert\b/i.test(text) || /赞助/i.test(text)
}
/** 单个卡片片段的读取。缺任何字段都返回 null，不猜。 */
const parseCard = (element: Element): SearchResultCard | null => {
  const asin = (element.getAttribute('data-asin') ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{10}$/.test(asin)) return null
  const body = element.innerHTML
  return {
    asin,
    title: readTitle(body),
    price: readPrice(body),
    rating: readRating(body),
    reviews: readReviews(element),
    sponsored: readSponsored(body),
  }
}
/**
 * 从一段 HTML 里读取完整卡片，保留嵌套结构与相邻卡片的边界。
 */
export const parseSearchResultCards = (html: string): SearchResultCard[] => {
  if (typeof html !== 'string' || html.length === 0) return []
  const document = new DOMParser().parseFromString(html, 'text/html')
  const cards: SearchResultCard[] = []
  for (const element of document.querySelectorAll(SEARCH_RESULT_CARD_SELECTOR)) {
    const card = parseCard(element)
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
