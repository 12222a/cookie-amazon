/**
 * 把解析结果绑到真实页面上：解析卡片、标记、把点击变成一次选中上报。
 *
 * 解析与选中分离，是为了 issue #4 的最后一条验收：识别失败不影响选中上报。
 * 识别不到卡片时页面照常浏览，只是没有可点的标记；点击仍然会被记成一次选中。
 */

import { AnalysisObjectStore } from '../analysis-object-store'
import type { StorageArea } from '../remote-config'
import {
  createStorefrontSelection,
  parseSearchResultCards,
  SEARCH_RESULT_CARD_SELECTOR,
  type SearchResultCard,
} from './search-results'

/** 标记写在卡片自身上，既是可观测的运行证据，也是样式的挂点。 */
export const AMAZON_CARD_MARKER_ATTRIBUTE = 'data-ca-amazon-card'
export const AMAZON_SELECTED_ATTRIBUTE = 'data-ca-amazon-selected'

/**
 * 解析结果落到卡片属性上的名字。集中在这里，避免解析端与读取端各写一遍字符串而悄悄漂移。
 * 用属性而不是内存 Map：卡片会被亚马逊重新渲染，属性跟着新节点走，Map 不会。
 */
const FIELD_ATTRIBUTES = {
  title: 'data-ca-amazon-title',
  price: 'data-ca-amazon-price',
  rating: 'data-ca-amazon-rating',
  reviews: 'data-ca-amazon-reviews',
  sponsored: 'data-ca-amazon-sponsored',
} as const

export const SELECTION_STYLE_ID = 'ca-amazon-selection-style'

/**
 * 选中层的样式。用 outline 而不是 border/box-shadow：outline 不参与布局，
 * 不会改变亚马逊卡片的尺寸与排布；offset 取负值让它画在卡片内缘。
 */
export const SELECTION_STYLE_TEXT = `
[${AMAZON_CARD_MARKER_ATTRIBUTE}] {
  outline: 1px solid rgba(245, 164, 81, .35);
  outline-offset: -1px;
}
[${AMAZON_CARD_MARKER_ATTRIBUTE}]:hover {
  outline-color: rgba(245, 164, 81, .8);
}
[${AMAZON_SELECTED_ATTRIBUTE}] {
  outline: 2px solid #f5a451;
  outline-offset: -2px;
}
`

type CardElement = Element & { dataset?: Record<string, string | undefined>; outerHTML?: string }

/**
 * 用鸭子类型而不是 `instanceof Element`：注入脚本与页面可能处在不同 realm，
 * 跨 world 拿到的节点不保证等于本 realm 的构造器。只要它能被 closest 查，就当元素用。
 */
const asClosestQueryable = (value: unknown): { closest: (selector: string) => Element | null } | null => {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as { closest?: unknown }
  return typeof candidate.closest === 'function'
    ? (value as { closest: (selector: string) => Element | null })
    : null
}

const readAsin = (card: Element): string | null => {
  const fromDataset = (card as CardElement).dataset?.asin
  const raw = typeof fromDataset === 'string' ? fromDataset : card.getAttribute('data-asin')
  const asin = (raw ?? '').trim().toUpperCase()
  return /^[A-Z0-9]{10}$/.test(asin) ? asin : null
}

const readNumberAttribute = (card: Element, name: string): number | null => {
  const raw = card.getAttribute(name)
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * 点击时从属性里回读机器可读字段。属性由 refresh() 从卡片自己的 HTML 解析后写入，
 * 所以这里不重新解析整页——点击只做一次属性读，快且不会因为 DOM 变化而错位。
 */
const readFieldsFromAttributes = (card: Element) => ({
  title: card.getAttribute(FIELD_ATTRIBUTES.title),
  price: readNumberAttribute(card, FIELD_ATTRIBUTES.price),
  rating: readNumberAttribute(card, FIELD_ATTRIBUTES.rating),
  reviews: readNumberAttribute(card, FIELD_ATTRIBUTES.reviews),
  sponsored: card.getAttribute(FIELD_ATTRIBUTES.sponsored) === 'true',
})

type CardFields = ReturnType<typeof readFieldsFromAttributes>

const hasAnyField = (fields: CardFields): boolean =>
  fields.title !== null || fields.price !== null || fields.rating !== null || fields.reviews !== null

const writeFields = (card: Element, fields: SearchResultCard): void => {
  try {
    if (fields.title !== null) card.setAttribute(FIELD_ATTRIBUTES.title, fields.title)
    if (fields.price !== null) card.setAttribute(FIELD_ATTRIBUTES.price, String(fields.price))
    if (fields.rating !== null) card.setAttribute(FIELD_ATTRIBUTES.rating, String(fields.rating))
    if (fields.reviews !== null) card.setAttribute(FIELD_ATTRIBUTES.reviews, String(fields.reviews))
    card.setAttribute(FIELD_ATTRIBUTES.sponsored, fields.sponsored ? 'true' : 'false')
  } catch {
    // 属性写入失败只影响字段可读性，不影响选中。
  }
}

/** 从卡片自身的 HTML 读出字段。读不到就返回 null，绝不生成空对象冒充已读到。 */
const parseCardElement = (card: Element, asin: string): SearchResultCard | null => {
  const markup = (card as CardElement).outerHTML
  if (typeof markup !== 'string' || markup.length === 0) return null
  const parsed = parseSearchResultCards(markup)
  return parsed.find((item) => item.asin === asin) ?? null
}

export const collectCards = (root: ParentNode): Element[] => {
  try {
    return [...root.querySelectorAll(SEARCH_RESULT_CARD_SELECTOR)]
  } catch {
    return []
  }
}

export type CardSelectionHandle = {
  /** 当前已标记的卡片数量，供运行观测使用。 */
  readonly markedCount: number
  /** 重新扫描页面上的卡片：解析字段、写属性、打标记。重复调用幂等。 */
  refresh: () => void
  /** 选中某个 ASIN：更新标记并写入对象存储。 */
  select: (asin: string) => Promise<boolean>
  dispose: () => void
}

/**
 * 挂载选中层。
 *
 * 不接管卡片自身的点击：亚马逊的链接跳转必须保持原样，所以监听挂在捕获阶段，
 * 既不 preventDefault 也不 stopPropagation；读得出 ASIN 时写一次存储。
 */
export const mountCardSelection = (
  document: Document,
  storage: StorageArea,
  options: { market?: string; now?: () => number } = {},
): CardSelectionHandle => {
  const store = new AnalysisObjectStore(storage)
  const cards = new Map<string, Element>()

  const markSelected = (asin: string | null): void => {
    for (const [current, card] of cards) {
      try {
        if (current === asin) card.setAttribute(AMAZON_SELECTED_ATTRIBUTE, 'true')
        else card.removeAttribute(AMAZON_SELECTED_ATTRIBUTE)
      } catch {
        // 标记失败不影响存储里的选中结果。
      }
    }
  }

  const select = async (asin: string): Promise<boolean> => {
    const card = cards.get(asin) ?? null
    const object = createStorefrontSelection(asin, null, {
      ...(options.market === undefined ? {} : { market: options.market }),
      ...(options.now === undefined ? {} : { now: options.now() }),
    })
    if (object === null) return false
    if (card !== null) {
      const fields = readFieldsFromAttributes(card)
      object.storefront = hasAnyField(fields)
        ? {
            title: fields.title,
            price: fields.price,
            rating: fields.rating,
            reviews: fields.reviews,
            sponsored: fields.sponsored,
          }
        : null
    }
    const written = await store.write(object)
    if (written) markSelected(asin)
    return written
  }

  const refresh = (): void => {
    for (const card of collectCards(document)) {
      const asin = readAsin(card)
      if (asin === null) continue
      cards.set(asin, card)
      try {
        card.setAttribute(AMAZON_CARD_MARKER_ATTRIBUTE, asin)
        const parsed = parseCardElement(card, asin)
        if (parsed !== null) writeFields(card, parsed)
      } catch {
        // 标记或解析失败仍保留在索引里，选中照常上报。
      }
    }
  }

  const listener = (event: Event): void => {
    const target = asClosestQueryable(event.target)
    if (target === null) return
    const card = target.closest(SEARCH_RESULT_CARD_SELECTOR)
    if (card === null) return
    const asin = readAsin(card)
    if (asin === null) return
    void select(asin)
  }

  refresh()
  document.addEventListener('click', listener, true)

  return {
    get markedCount() { return cards.size },
    refresh,
    select,
    dispose: () => { document.removeEventListener('click', listener, true) },
  }
}
