import { describe, expect, it, vi } from 'vitest'
import { ANALYSIS_OBJECT_STORAGE_KEY } from '../../analysis-object-store'
import {
  AMAZON_CARD_MARKER_ATTRIBUTE,
  AMAZON_SELECTED_ATTRIBUTE,
  collectCards,
  mountCardSelection,
} from '../selection'

/**
 * 最小假 DOM：只覆盖本模块实际用到的那几个 API。
 * 关键点是卡片带 outerHTML——生产路径正是靠它把字段解析出来的。
 */
const makeCard = (asin: string, html = '<h2><span>Card</span></h2>') => {
  const attributes = new Map<string, string>([['data-asin', asin]])
  const card = {
    dataset: { asin },
    outerHTML: `<div data-component-type="s-search-result" data-asin="${asin}">${html}</div>`,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => { attributes.set(name, value) },
    removeAttribute: (name: string) => { attributes.delete(name) },
    has: (name: string) => attributes.has(name),
    attributes,
  }
  return card
}

const makeDocument = (cards: readonly ReturnType<typeof makeCard>[]) => {
  const listeners: Array<(event: unknown) => void> = []
  const document = {
    querySelectorAll: () => cards,
    addEventListener: (_type: string, listener: (event: unknown) => void) => { listeners.push(listener) },
    removeEventListener: vi.fn(),
  }
  return { document, listeners }
}

const makeStorage = () => {
  const written: Record<string, unknown> = {}
  return {
    written,
    area: {
      get: async (key: string) => ({ [key]: written[key] }),
      set: async (items: Record<string, unknown>) => { Object.assign(written, items) },
    },
  }
}

const clickOn = (card: unknown) => ({
  target: { closest: (selector: string) => selector.includes('s-search-result') ? card : null },
})

const REAL_CARD_FIELDS = [
  '<h2 class="a-size-base-plus"><a href="/dp/B0ABCDEFGH"><span>Phone Stand Aluminum</span></a></h2>',
  '<span class="a-price"><span class="a-offscreen">$24.99</span></span>',
  '<span class="a-icon-alt">4.5 out of 5 stars</span>',
  '<a href="/product-reviews/B0ABCDEFGH#customerReviews"><span aria-label="4,236 ratings">4,236</span></a>',
  '<span class="a-color-secondary">Sponsored</span>',
].join('')

describe('card selection layer', () => {
  it('marks every card that carries a readable ASIN', () => {
    const cards = [makeCard('B0ABCDEFGH'), makeCard('not-an-asin')]
    const { document } = makeDocument(cards)
    const handle = mountCardSelection(document as unknown as Document, makeStorage().area)
    expect(handle.markedCount).toBe(1)
    expect(cards[0]?.getAttribute(AMAZON_CARD_MARKER_ATTRIBUTE)).toBe('B0ABCDEFGH')
    expect(cards[1]?.has(AMAZON_CARD_MARKER_ATTRIBUTE)).toBe(false)
    handle.dispose()
  })

  it('parses each card into field attributes so a click can read them back', () => {
    const card = makeCard('B0ABCDEFGH', REAL_CARD_FIELDS)
    const { document } = makeDocument([card])
    const handle = mountCardSelection(document as unknown as Document, makeStorage().area)
    expect(card.getAttribute('data-ca-amazon-title')).toBe('Phone Stand Aluminum')
    expect(card.getAttribute('data-ca-amazon-price')).toBe('24.99')
    expect(card.getAttribute('data-ca-amazon-rating')).toBe('4.5')
    expect(card.getAttribute('data-ca-amazon-reviews')).toBe('4236')
    expect(card.getAttribute('data-ca-amazon-sponsored')).toBe('true')
    handle.dispose()
  })

  it('writes the clicked card into the object store with its real visible fields', async () => {
    const card = makeCard('B0ABCDEFGH', REAL_CARD_FIELDS)
    const { document, listeners } = makeDocument([card])
    const storage = makeStorage()
    const handle = mountCardSelection(document as unknown as Document, storage.area, { now: () => 1_700_000_000_000 })
    listeners.forEach((listener) => listener(clickOn(card)))
    await vi.waitFor(() => { expect(card.getAttribute(AMAZON_SELECTED_ATTRIBUTE)).toBe('true') })
    expect(storage.written[ANALYSIS_OBJECT_STORAGE_KEY]).toEqual({
      asin: 'B0ABCDEFGH',
      market: 'US',
      source: 'storefront',
      storefront: { title: 'Phone Stand Aluminum', price: 24.99, rating: 4.5, reviews: 4236, sponsored: true },
      owner: null,
      group: null,
      createdAt: 1_700_000_000_000,
    })
    handle.dispose()
  })

  it('still reports the selection when the card has no readable fields', async () => {
    const card = makeCard('B0ABCDEFGH', '<div>markup changed</div>')
    const { document, listeners } = makeDocument([card])
    const storage = makeStorage()
    const handle = mountCardSelection(document as unknown as Document, storage.area)
    listeners.forEach((listener) => listener(clickOn(card)))
    await vi.waitFor(() => { expect(card.getAttribute(AMAZON_SELECTED_ATTRIBUTE)).toBe('true') })
    expect(storage.written[ANALYSIS_OBJECT_STORAGE_KEY]).toMatchObject({ asin: 'B0ABCDEFGH', storefront: null })
    handle.dispose()
  })

  it('ignores clicks outside a card and non-element targets', async () => {
    const card = makeCard('B0ABCDEFGH', REAL_CARD_FIELDS)
    const { document, listeners } = makeDocument([card])
    const storage = makeStorage()
    const handle = mountCardSelection(document as unknown as Document, storage.area)
    listeners.forEach((listener) => {
      listener({ target: { closest: () => null } })
      listener({ target: 42 })
    })
    await Promise.resolve()
    expect(storage.written[ANALYSIS_OBJECT_STORAGE_KEY]).toBeUndefined()
    handle.dispose()
  })

  it('never touches the event itself, so amazon navigation keeps working', () => {
    const card = makeCard('B0ABCDEFGH', REAL_CARD_FIELDS)
    const { document, listeners } = makeDocument([card])
    const handle = mountCardSelection(document as unknown as Document, makeStorage().area)
    const event = { ...clickOn(card), preventDefault: vi.fn(), stopPropagation: vi.fn() }
    listeners.forEach((listener) => listener(event))
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
    handle.dispose()
  })

  it('survives a document whose querySelectorAll throws', () => {
    const document = {
      querySelectorAll: () => { throw new Error('markup changed') },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    expect(() => mountCardSelection(document as unknown as Document, makeStorage().area)).not.toThrow()
  })

  it('keeps the card in the index when parsing its markup throws', async () => {
    const card = makeCard('B0ABCDEFGH', REAL_CARD_FIELDS)
    Object.defineProperty(card, 'outerHTML', { get: () => { throw new Error('no markup') } })
    const { document, listeners } = makeDocument([card])
    const storage = makeStorage()
    const handle = mountCardSelection(document as unknown as Document, storage.area)
    expect(handle.markedCount).toBe(1)
    listeners.forEach((listener) => listener(clickOn(card)))
    await vi.waitFor(() => { expect(card.getAttribute(AMAZON_SELECTED_ATTRIBUTE)).toBe('true') })
    expect(storage.written[ANALYSIS_OBJECT_STORAGE_KEY]).toMatchObject({ asin: 'B0ABCDEFGH' })
    handle.dispose()
  })

  it('collectCards returns an empty list instead of throwing', () => {
    const root = { querySelectorAll: () => { throw new Error('bad root') } }
    expect(collectCards(root as unknown as ParentNode)).toEqual([])
  })
})
