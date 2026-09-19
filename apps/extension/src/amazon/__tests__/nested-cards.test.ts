import { describe, expect, it } from 'vitest'
import { parseSearchResultCards } from '../search-results'

/**
 * 真实亚马逊卡片的内部是嵌套 div：标题在一段，价格/评分/评论/Sponsored 在另一段。
 * 旧的懒惰正则配对在第一个嵌套 </div> 就收尾，于是除标题外全部静默变 null。
 * 这里用嵌套夹具把那个行为钉住。
 */
const nestedCard = (asin: string, title: string, price: string, rating: string, reviews: string, sponsored: boolean): string => [
  '<div data-component-type="s-search-result" data-asin="' + asin + '" class="s-result-item s-asin">',
  '  <div class="a-section a-spacing-small">',
  '    <h2 class="a-size-base-plus"><span>' + title + '</span></h2>',
  '  </div>',
  '  <div class="a-section a-spacing-small">',
  '    <div class="a-row">',
  '      <span class="a-price"><span class="a-offscreen">' + price + '</span></span>',
  '    </div>',
  '    <div class="a-row">',
  '      <span class="a-icon-alt">' + rating + '</span>',
  '      <span class="a-size-base s-underline-text" aria-label="' + reviews + ' ratings">' + reviews + '</span>',
  '    </div>',
  sponsored ? '    <span class="a-color-secondary">Sponsored</span>' : '    <span class="a-color-secondary"> </span>',
  '  </div>',
  '</div>',
].join('\n')

const ONE = nestedCard('B0NESTED01', 'Nested Phone Stand', '$19.99', '4.3 out of 5 stars', '1,204', true)
const TWO = nestedCard('B0NESTED02', 'Second Nested Item', '$34.50', '3.9 out of 5 stars', '88', false)

describe('nested search result cards', () => {
  it('reads every field when the card body nests divs', () => {
    expect(parseSearchResultCards(ONE)).toEqual([{
      asin: 'B0NESTED01',
      title: 'Nested Phone Stand',
      price: 19.99,
      rating: 4.3,
      reviews: 1204,
      sponsored: true,
    }])
  })

  it('keeps consecutive nested cards from bleeding into each other', () => {
    const cards = parseSearchResultCards(ONE + TWO)
    expect(cards.map((item) => item.asin)).toEqual(['B0NESTED01', 'B0NESTED02'])
    expect(cards[1]).toEqual({
      asin: 'B0NESTED02',
      title: 'Second Nested Item',
      price: 34.5,
      rating: 3.9,
      reviews: 88,
      sponsored: false,
    })
  })

  it('does not treat a nested div as the end of the card', () => {
    // 只有容器的闭合标签才算结束：把卡片后面再接一段别的 DOM，不能污染结果。
    const cards = parseSearchResultCards(ONE + '<div class="s-pagination"><span>$999</span></div>')
    expect(cards).toHaveLength(1)
    expect(cards[0]?.price).toBe(19.99)
    expect(cards[0]?.sponsored).toBe(true)
  })
})
