import type { ReactElement } from 'react'
import type { SellerSpriteMarketResearchData } from '@cookie-amazon/web-sdk'

const number = (value: number | null): string =>
  value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 1 })
const money = (value: number | null): string =>
  value === null ? '—' : `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const percent = (value: number | null): string =>
  value === null ? '—' : `${(value * 100).toFixed(1)}%`

export function MarketResearchResults({
  data,
  filtersLabel,
}: {
  data: SellerSpriteMarketResearchData
  filtersLabel: string
}): ReactElement {
  return (
    <div className="pr-table-shell">
      <div className="pr-table-scroll">
        <table className="pr-products-table pr-market-table">
          <thead><tr>
            <th scope="col">细分市场</th><th scope="col">样本<br />商品 / 品牌 / 卖家</th>
            <th scope="col">月总销量</th><th scope="col">月均销量<br />头部商品</th>
            <th scope="col">月均销售额<br />头部商品</th><th scope="col">评分数 / 星级</th>
            <th scope="col">平均 BSR<br />头部商品</th><th scope="col">卖家数 / 价格</th>
            <th scope="col">FBA / AMZ / FBM</th><th scope="col">商品 / 品牌 / 卖家集中度</th>
            <th scope="col">新品数量 / 占比</th><th scope="col">商品总数</th><th scope="col">利润</th>
          </tr></thead>
          <tbody>{data.rows.map((row, index) => <tr key={`${row.marketName}-${index}`}>
            <td><strong>{row.marketName}</strong></td>
            <td className="pr-number">{number(row.sampleProducts)} / {number(row.sampleBrands)} / {number(row.sampleSellers)}</td>
            <td className="pr-number">{number(row.totalSales)}</td>
            <td className="pr-number">{number(row.averageSales)} / {number(row.headSales)}</td>
            <td className="pr-number">{money(row.averageRevenue)} / {money(row.headRevenue)}</td>
            <td className="pr-number">{number(row.averageReviews)} / {number(row.averageRating)}</td>
            <td className="pr-number">{number(row.averageBsr)} / {number(row.headBsr)}</td>
            <td className="pr-number">{number(row.averageSellers)} / {money(row.averagePrice)}</td>
            <td className="pr-number">{percent(row.fbaRatio)} / {percent(row.amzRatio)} / {percent(row.fbmRatio)}</td>
            <td className="pr-number">{percent(row.productConcentration)} / {percent(row.brandConcentration)} / {percent(row.sellerConcentration)}</td>
            <td className="pr-number">{number(row.newProductCount)} / {percent(row.newProductRatio)}</td>
            <td className="pr-number">{number(row.totalProducts)}</td>
            <td>未接入</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="pr-table-footer">
        <span>SellerSprite `/v2/market-research` 真实结果 · {data.rows.length} 个细分市场 · {filtersLabel}</span>
        <span>利润保持未接入；未从价格或销售额推算</span>
      </div>
    </div>
  )
}