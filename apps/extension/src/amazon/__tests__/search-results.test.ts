import { describe, expect, it } from 'vitest'
import { DEFAULT_MARKET } from '../../analysis-object'
import {
  createStorefrontSelection,
  parseSearchResultCards,
  SEARCH_RESULT_CARD_SELECTOR,
} from '../search-results'
const card = ({ asin, body }: { asin: string; body: string }): string =>
  `<div data-component-type="s-search-result" data-asin="${asin}" class="s-result-item">${body}</div>`
const FULL_CARD = card({
  asin: 'B0ABCDEFGH',
  body: [
    '<h2 class="a-size-base-plus"><a class="a-link-normal" href="/dp/B0ABCDEFGH"><span>Phone Stand Aluminum</span></a></h2>',
    '<span class="a-price"><span class="a-offscreen">$24.99</span></span>',
    '<span class="a-icon-alt">4.5 out of 5 stars</span>',
    '<a href="/product-reviews/B0ABCDEFGH#customerReviews"><span aria-label="4,236 ratings">4,236</span></a>',
    '<span class="a-color-secondary">Sponsored</span>',
  ].join(''),
})
const SPARSE_CARD = card({
  asin: 'B0IJKLMNOP',
  body: '<h2><span>Generic Holder</span></h2><span class="a-price"><span class="a-offscreen">$9.99</span></span>',
})
const NESTED_CARD_BODY = `
  <div class="a-section s-card-container">
    <div class="a-section s-product-image-container">
      <a href="/dp/B0ABCDEFGH"><div class="a-section"><img alt="Phone stand"></div></a>
    </div>
    <div class="a-section s-title-instructions-style">
      <div class="a-row"><a href="/dp/B0ABCDEFGH"><h2><span>Phone Stand Aluminum</span></h2></a></div>
      <div class="a-row"><i><span class="a-icon-alt">4.5 out of 5 stars</span></i></div>
      <div class="a-row"><a href="/product-reviews/B0ABCDEFGH" aria-label="4,236 ratings"><span>4,236</span></a></div>
    </div>
    <div class="a-section"><div class="a-row">
      <span class="a-price"><span class="a-offscreen">$24.99</span></span>
    </div></div>
    <div class="a-section"><span class="a-color-secondary">Sponsored</span></div>
  </div>
`
describe('search result card parsing', () => {
  it('extracts every field the panel shows', () => {
    const [first] = parseSearchResultCards(FULL_CARD)
    expect(first).toEqual({
      asin: 'B0ABCDEFGH',
      title: 'Phone Stand Aluminum',
      price: 24.99,
      rating: 4.5,
      reviews: 4236,
      sponsored: true,
    })
  })
  it('reads the entire nested storefront card including a Sponsored label at the end', () => {
    expect(parseSearchResultCards(card({ asin: 'B0ABCDEFGH', body: NESTED_CARD_BODY }))).toEqual([{
      asin: 'B0ABCDEFGH',
      title: 'Phone Stand Aluminum',
      price: 24.99,
      rating: 4.5,
      reviews: 4236,
      sponsored: true,
    }])
  })
  it('keeps missing fields null instead of inventing values', () => {
    const [sparse] = parseSearchResultCards(SPARSE_CARD)
    expect(sparse).toMatchObject({
      asin: 'B0IJKLMNOP',
      title: 'Generic Holder',
      price: 9.99,
      rating: null,
      reviews: null,
      sponsored: false,
    })
  })
  it('parses several cards without letting one bleed into the next', () => {
    const cards = parseSearchResultCards(FULL_CARD + SPARSE_CARD)
    expect(cards.map((item) => item.asin)).toEqual(['B0ABCDEFGH', 'B0IJKLMNOP'])
    expect(cards[0]?.title).toBe('Phone Stand Aluminum')
    expect(cards[1]?.title).toBe('Generic Holder')
  })
  it('returns an empty list for pages without cards and never throws', () => {
    expect(parseSearchResultCards('')).toEqual([])
    expect(parseSearchResultCards('<html><body><p>no results</p></body></html>')).toEqual([])
    expect(parseSearchResultCards('<div data-component-type="s-search-result"')).toEqual([])
    expect(parseSearchResultCards(card({ asin: '', body: '<h2>No asin</h2>' }))).toEqual([])
  })
  it('reads a price with thousands separators and a localized rating phrase', () => {
    const [item] = parseSearchResultCards(card({
      asin: 'B0QQQQQQQQ',
      body: '<h2><span>Bundle</span></h2><span class="a-offscreen">$1,234.50</span><span class="a-icon-alt">4,0 von 5 Sternen</span>',
    }))
    expect(item?.price).toBe(1234.5)
    expect(item?.rating).toBe(4)
  })
  it('exposes a selector that matches the container the parser reads', () => {
    expect(SEARCH_RESULT_CARD_SELECTOR).toBe('[data-component-type="s-search-result"]')
  })
})
describe('storefront selection', () => {
  it('builds an analysis object from the clicked card', () => {
    const object = createStorefrontSelection('B0ABCDEFGH', FULL_CARD, { market: DEFAULT_MARKET, now: 1_700_000_000_000 })
    expect(object).toEqual({
      asin: 'B0ABCDEFGH',
      market: 'US',
      source: 'storefront',
      storefront: { title: 'Phone Stand Aluminum', price: 24.99, rating: 4.5, reviews: 4236, sponsored: true },
      owner: null,
      group: null,
      createdAt: 1_700_000_000_000,
    })
  })
  it('still reports the selection when the card cannot be read', () => {
    const object = createStorefrontSelection('B0ABCDEFGH', '<html>markup changed</html>', { market: DEFAULT_MARKET })
    expect(object?.asin).toBe('B0ABCDEFGH')
    expect(object?.storefront).toBeNull()
    expect(createStorefrontSelection('B0ABCDEFGH', null, { market: DEFAULT_MARKET })?.storefront).toBeNull()
  })
  it('normalizes the ASIN and refuses one that cannot be an ASIN', () => {
    expect(createStorefrontSelection(' b0abcdefgh ', FULL_CARD, { market: DEFAULT_MARKET })?.asin).toBe('B0ABCDEFGH')
    expect(createStorefrontSelection('not-an-asin', FULL_CARD, { market: DEFAULT_MARKET })).toBeNull()
    expect(createStorefrontSelection('', FULL_CARD, { market: DEFAULT_MARKET })).toBeNull()
  })
})
