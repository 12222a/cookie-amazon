import { describe, expect, it } from 'vitest'
import { parseSearchResultCards } from '../search-results'

/**
 * 评论数只能从「像评论数的地方」读。
 *
 * 反例都是真实亚马逊卡片里存在、且字面上带数字的 aria-label：
 * 星级标签、配送承诺、库存提示。旧实现取「第一个带数字的 aria-label」，
 * 于是 4.5 out of 5 stars 变成 4 条评论、FREE delivery Sep 23 变成 23 条。
 * 这类错误尤其难发现：数字看起来合理，用户不会怀疑。
 */
const card = (body: string): string =>
  '<div data-component-type="s-search-result" data-asin="B0REVIEW01">' + body + '</div>'

describe('review count provenance', () => {
  it('reads the count from the reviews link', () => {
    const [item] = parseSearchResultCards(card(
      '<h2><span>Item</span></h2>'
      + '<a href="/product-reviews/B0REVIEW01#customerReviews"><span aria-label="4,236 ratings">4,236</span></a>',
    ))
    expect(item?.reviews).toBe(4236)
  })

  it('does not read a star rating as a review count', () => {
    const [item] = parseSearchResultCards(card(
      '<h2><span>Item</span></h2>'
      + '<span class="a-price"><span class="a-offscreen">$19.99</span></span>'
      + '<i><span class="a-icon-alt">4.5 out of 5 stars</span></i>'
      + '<i><span aria-label="4.5 out of 5 stars"></span></i>',
    ))
    expect(item?.reviews).toBeNull()
    expect(item?.rating).toBe(4.5)
  })

  it('does not read a delivery promise or stock hint as a review count', () => {
    const [delivery] = parseSearchResultCards(card(
      '<h2><span>Item</span></h2>'
      + '<span aria-label="FREE delivery Tue, Sep 23 on $35 of items"></span>',
    ))
    expect(delivery?.reviews).toBeNull()
    const [stock] = parseSearchResultCards(card(
      '<h2><span>Item</span></h2>'
      + '<span aria-label="Only 12 left in stock - order soon."></span>',
    ))
    expect(stock?.reviews).toBeNull()
  })
})

