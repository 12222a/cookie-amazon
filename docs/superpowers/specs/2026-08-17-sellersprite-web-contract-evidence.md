# SellerSprite 网页会话接口脱敏证据

## 1. 文档状态

- 证据来源：官方 Playwright MCP 复用用户已登录的 Chrome 会话并执行真实网页操作。
- 记录范围：固定 pathname、HTTP method、Query/Body 字段名、状态码、响应键结构、Cookie 自动携带布尔值、其他认证字段名。
- 数据约束：本文不包含 Cookie、Authorization、Session、`secret-key` 内容，不包含完整请求头、参数值、完整响应或用户隐私。
- 认证结论：以下请求均由浏览器自动携带 Cookie；未观察到其他认证字段。

## 2. 登录状态正向探测

| 项目 | 证据 |
|---|---|
| Pathname | `/v2/me` |
| Method | `GET` |
| Query | 无 |
| Body | 无 |
| Status | `200` |
| Response | `text/html` |
| 最终 pathname | `/v2/me` |
| Cookie 自动携带 | 是 |
| 其他认证字段 | 无 |

只确认已登录正向行为。未登录时的最终重定向 pathname 尚未确认。实现不得读取、返回或持久化个人中心 HTML；只允许使用状态码、最终 origin/pathname 和重定向结果生成 `{ loggedIn: boolean }`。

## 3. 关键词反查

### 3.1 统计关键词

- `POST /v3/api/relation/stat-keywords`
- Query：无
- Body：`asin`, `badges`, `forceReStat`, `limit`, `marketId`, `month`
- Status：`200`
- Response keys：

```text
code
data
  analysisTook
  asin
  market
  marketId
  statDto
  status
  website
  writeMode
message
success
```

### 3.2 月度信息

- `GET /v3/api/relation/ta/monthly`
- Query：`asin`, `month`, `station`
- Body：无
- Status：`200`
- Response keys：

```text
code
data
  monthlyDto
  variations[]
    alias
    asin
    asinUrl
    availableDate
    availableDays
    bsrLabel
    bsrRank
    currency
    imageUrl
    keywords
    price
    rating
    relations
    reviews
    reviewsRate
    sku
    skuStr
    station
    title
    zoomImageUrl
message
success
```

### 3.3 反查结果

- `POST /v3/api/relation/reversing`
- Query：`market=COM`（美国站 `marketId=1` 的真实网页请求值；不是内部站点代码 `US`）
- Body：`ac`, `asin`, `badges`, `conversionKeywordTypes`, `desc`, `exactly`, `filterDeletedKeywords`, `keywordBidMatchType`, `limit`, `month`, `order`, `skip`, `trafficKeywordTypes`
- Status：`200`
- Response keys：`code`, `data`, `message`, `success`
- 本次 `data` 没有可安全确认的内部键，不做推测。

### 3.4 高频词

- `POST /v3/api/relation/ta/high-frequency-words-new`
- Query：`market`
- Body：`ac`, `asin`, `badges`, `conversionKeywordTypes`, `desc`, `exactly`, `filterDeletedKeywords`, `groupNum`, `keywordBidMatchType`, `month`, `order`, `trafficKeywordTypes`
- Status：`200`
- Response keys：`code`, `data[]`, `message`, `success`

## 4. 查竞品

- `POST /v3/api/competing-lookup`
- Query：无
- Body：

```text
asins
lowPrice
market
monthName
nodeIdPaths
order
  desc
  field
page
size
symbolFlag
```

- Status：`200`
- Response keys：

```text
code
data
  guestId
  guestVisited
  hasNextPage
  items[]
  order
    desc
    field
  page
  pages
  size
  symbolChecked
  terminal
  took
  total
  url
message
success
```

产品条目已观察键：

```text
alias, amazonChoice, amzUnit, amzUnitDate, amzUnitTrend, amzUnitTrends[], asin,
asinUrl, availableDate, availableDays, availableMonth, availableYear, averagePrice,
bestSeller, bigImageUrl, brand, brand0, brandShort, brandUrl, bsrId, bsrLabel,
bsrRank, bsrRankCr, bsrRankCv, category1Id, category1Name, categoryId, categoryName,
channel, conversionRate, coupon, createdTime, curMon, curMonDaysales, deliveryPrice,
dimensionType, dimensions, dimensionsTag, ebc, estimatedSales, fba, fbaAmount,
fbaUnits, firstReviewDate, guestId, guestVisited, hasNextPage, id, imageUrl,
impression, items, liked, lqs, marketId, monDailySales, monthId, monthName,
newRelease, nodeId, nodeIdPath, nodeLabelLocale, nodeLabelPath, nodeLabelPathLocale,
order, overviews, page, pages, parent, parentChangeHis[], pkgDimensionType,
pkgDimensions, pkgDimensionsTag, pkgVolumeWeights, pkgWeight, pkgWeightTag, price,
primeExclusivePrice, profit, profitDto, publishDate, questions, rating, reviews,
reviewsDelta, reviewsIncreasement, reviewsRate, salesTrend, sellerDto, sellerId,
sellerName, sellerNation, sellerType, sellers, size, sku, source, station,
subSalesRank, subTotalAmount, subcategories[], symbol, syncTime, table, terminal,
title, title0, took, total, totalAmount, totalAmountGrowth, totalAmountRank,
totalUnits, totalUnitsGrowth, totalUnitsGrowthYoy, totalUnitsGrowthYoyLag1,
totalUnitsGrowthYoyLag2, totalUnitsGrowthYoyLag3, totalUnitsGrowthYoyLag4,
totalUnitsGrowthYoyLag5, trends[], updatedTime, url, variationAsin, variations,
video, videoUrl, weight, weightTag
```

嵌套键：`amzUnitTrends[] { dk, sales }`、`subcategories[] { code, label, rank }`、`order { desc, field }`。

## 5. 选产品

- `POST /v3/api/product-research`
- Query：无
- Body：

```text
eligibility
filterSub
lowPrice
market
monthName
nodeIdPaths
order
  desc
  field
page
pkgDimensionTypeList
productTags
selectType
sellerNationList
sellerTypes
size
symbolFlag
weightUnit
```

- Status：`200`
- Response keys：

```text
code
data
  guestId
  guestVisited
  hasNextPage
  items[]
  order
    desc
    field
  page
  pages
  size
  terminal
  took
  total
  url
message
success
```

`data.items[]` 与“查竞品”观察到的产品条目键结构一致。

## 6. 选市场

该能力是 HTML 表单请求，不是 JSON API。

- `POST /v2/market-research`
- Query：无
- Status：`200`
- Response：`text/html`
- JSON keys：不适用
- Body 字段：

```text
departmentKeyword, marketId,
maxAmzRatio, maxAvgBsr, maxAvgPrice, maxAvgProfit, maxAvgRating, maxAvgRevenue,
maxAvgReviews, maxAvgSales, maxAvgSellers, maxAvgVolume, maxAvgWeight, maxBrands,
maxEbcRatio, maxFbaRatio, maxFbmRatio, maxHeadListingAvgBsr,
maxHeadListingAvgRevenue, maxHeadListingAvgSales, maxHeadListingBrandCrn,
maxHeadListingProductCrn, maxHeadListingSellerCrn, maxNewAvgPrice, maxNewAvgRating,
maxNewAvgRevenue, maxNewAvgReviews, maxNewAvgSales, maxNewCount, maxNewRatio,
maxSellers, maxTotalProducts,
minAmzRatio, minAvgBsr, minAvgPrice, minAvgProfit, minAvgRating, minAvgRevenue,
minAvgReviews, minAvgSales, minAvgSellers, minAvgVolume, minAvgWeight, minBrands,
minEbcRatio, minFbaRatio, minFbmRatio, minHeadListingAvgBsr,
minHeadListingAvgRevenue, minHeadListingAvgSales, minHeadListingBrandCrn,
minHeadListingProductCrn, minHeadListingSellerCrn, minNewAvgPrice, minNewAvgRating,
minNewAvgRevenue, minNewAvgReviews, minNewAvgSales, minNewCount, minNewRatio,
minSellers, minTotalProducts, monthName, newReleaseNum, newReleaseNumSelect,
nodeIdPath, order.desc, order.field, sampleNumber, sellerNations, tab, topNSelect,
topn
```

实现必须使用独立 HTML transport，并禁止将响应正文返回到 Web 或持久化。

## 7. 关键词选品

该能力是 HTML 页面请求，不是 JSON API。

- `GET /v2/keyword-research`
- Body：无
- Status：`200`
- Response：`text/html`
- JSON keys：不适用
- Query 字段：

```text
adminDes, excludeKeywords, exportGkImages, includeKeywords, itemImageRange,
keywordBidMatchType, limitUserStatic, marketId, marketPeriod,
maxAvgPrice, maxAvgRating, maxAvgReviews, maxBid, maxClicks, maxCvsShareRate,
maxGoodsValue, maxGrowth, maxGrowthRateTrendMin, maxGrowthTrendMin, maxImpressions,
maxMonopolyClickRate, maxProducts, maxPurchaseRate, maxPurchases, maxSPR,
maxSearches, maxSupplyDemandRatio, maxTitleDensity, maxWordCount, maxYearlyGrowth,
maxYearlyGrowthRate,
minAvgPrice, minAvgRating, minAvgReviews, minBid, minClicks, minCvsShareRate,
minGoodsValue, minGrowth, minGrowthRateTrendMin, minGrowthTrendMin, minImpressions,
minMonopolyClickRate, minProducts, minPurchaseRate, minPurchases, minSPR,
minSearches, minSupplyDemandRatio, minTitleDensity, minWordCount, minYearlyGrowth,
minYearlyGrowthRate, month, order.desc, order.field, presetMode, station,
supplement, usestatic
```

实现必须使用独立 HTML transport，并禁止将响应正文返回到 Web 或持久化。

## 8. 关键词挖掘

### 8.1 主结果

- `POST /v3/api/keyword-miner`
- Query：无
- Body：`amazonChoice`, `desc`, `filterRootWord`, `historyDate`, `keyword`, `keywordBidMatchType`, `market`, `matchType`, `orderBy`, `pageNum`, `pageSize`
- Status：`200`
- Response keys：

```text
code
data
  items[]
  page
  size
  took
  total
message
success
```

本次 `items[]` 为空，不推测元素键结构。

### 8.2 高频词

- `POST /v3/api/keyword-miner/high/frequency-new`
- Query：无
- Body：`amazonChoice`, `desc`, `filterRootWord`, `groupNum`, `historyDate`, `keyword`, `keywordBidMatchType`, `market`, `matchType`, `orderBy`
- Status：`200`
- Response keys：`code`, `data[]`, `message`, `success`

### 8.3 已删除关键词

- `GET /v3/api/keyword-miner/deleted/keyword/list`
- Query：`historyDate`, `keywordOrAsin`, `market`, `type`
- Body：无
- Status：`200`
- Response keys：`code`, `data[]`, `message`, `success`

### 8.4 搜索建议

- `GET /v3/api/suggestions`
- Query：`keyword`, `station`
- Body：无
- Status：`200`
- Response keys：`code`, `data[]`, `message`, `success`

## 9. Phase 9 约束

1. Origin 固定为 `https://www.sellersprite.com`。
2. Pathname、Method、Query 和 Body 字段必须按能力静态 allowlist。
3. 请求使用浏览器管理的 `credentials: 'include'`，代码不读取 Cookie。
4. 禁止调用方提供 Cookie、Authorization、Session、`secret-key` 或任意 headers。
5. JSON XHR 和 HTML 页面/表单使用不同 transport 与解析器。
6. HTML 正文不得跨越扩展边界或进入存储、日志。
7. JSON 结果必须经能力专用 Schema 最小化后再返回。
8. RemoteConfig 只能关闭已编译能力或缩短超时，不能更改 Origin、Path、Method 或字段集合。