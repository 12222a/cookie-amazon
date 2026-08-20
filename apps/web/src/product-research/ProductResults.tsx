import type { ReactElement } from 'react'
import type { OpportunityProduct } from './opportunity'
import { amazonProductUrl } from './amazon'

const formatNumber = (value: number | null): string =>
  value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 0 })

const formatMoney = (value: number | null): string =>
  value === null ? '—' : `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

const scoreTone = (score: number | null): string =>
  score === null ? 'score-muted' : score >= 70 ? 'score-strong' : score >= 50 ? 'score-watch' : 'score-risk'

export function ProductResults({
  products,
  market,
}: {
  products: readonly OpportunityProduct[]
  market: string
}): ReactElement {
  if (products.length === 0) {
    return (
      <div className="pr-empty" role="status">
        <span className="pr-empty-mark">⌁</span>
        <div>
          <strong>还没有结果</strong>
          <p>输入关键词开始一次市场扫描，结果会在这里按研究优先级排序。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pr-table-shell">
      <div className="pr-table-scroll">
        <table className="pr-products-table">
          <thead>
            <tr>
              <th scope="col">商品</th>
              <th scope="col">类目</th>
              <th scope="col">价格</th>
              <th scope="col">月销量</th>
              <th scope="col">月销售额</th>
              <th scope="col">评分 / 评论</th>
              <th scope="col">Listing Age</th>
              <th scope="col">BSR 快照</th>
              <th scope="col">研究优先级</th>
              <th scope="col">来源</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const url = amazonProductUrl(market, product.asin)
              return (
                <tr key={product.asin}>
                  <td className="pr-product-cell">
                    {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span className="pr-image-fallback">AMZ</span>}
                    <div>
                      <span className="pr-product-brand">{product.brand ?? '未标注品牌'}</span>
                      <strong title={product.title ?? undefined}>{product.title ?? '未提供标题'}</strong>
                      <span className="pr-asin">{url ? <a href={url} target="_blank" rel="noreferrer">{product.asin} ↗</a> : product.asin}</span>
                    </div>
                  </td>
                  <td><span className="pr-category">{product.category}</span></td>
                  <td className="pr-number pr-price">{formatMoney(product.price)}</td>
                  <td className="pr-number">{formatNumber(product.monthlySales)}</td>
                  <td className="pr-number pr-revenue">{formatMoney(product.monthlyRevenue)}</td>
                  <td>
                    <span className="pr-rating">{product.rating === null ? '—' : `★ ${product.rating.toFixed(1)}`}</span>
                    <small className="pr-review-count">{formatNumber(product.reviews)} reviews</small>
                  </td>
                  <td className="pr-number">{product.availableDays == null ? '—' : `${Math.round(product.availableDays)} 天`}</td>
                  <td className="pr-number" title={product.bsrLabel ?? undefined}>{formatNumber(product.bsrRank ?? null)}</td>
                  <td><span className={`pr-score ${scoreTone(product.researchPriority)}`}>{product.researchPriority ?? '—'}</span></td>
                  <td><span className={`pr-source pr-source--${product.source}`}>{product.source === 'v3-api' ? 'v3 API' : product.source === 'v2-dom' ? 'v2 DOM' : 'Demo'}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="pr-table-footer"><span>显示 {products.length} 个商品</span><span>研究优先级基于当前结果集内的销量、评论壁垒与评分相对位置</span></div>
    </div>
  )
}