# Phase 10 SellerSprite 产品研究数据工作台与历史趋势分析 规格

## 1. 状态

- 阶段：Phase 10
- 状态：进行中
- 依赖：Phase 9 已冻结的 `PRODUCT_SELECTION`（`POST /v3/api/product-research`）能力与 Web SDK `selectSellerSpriteProducts`
- 当前切片：在 Web 端接入产品研究能力，落地本地 IndexedDB 历史快照存储、用户手动刷新数据流，以及基于时间序列的历史趋势分析工作台。

## 2. 目标

让用户可以在 Web 页面持续使用 SellerSprite 产品研究能力，将每次手动刷新得到的产品列表保存为带时间戳的历史快照，并在同一产品（ASIN）维度上做跨时间的趋势对比与分析。

核心决策：

- 存储：本地 IndexedDB，不依赖后端或 Worker，不上传数据。
- 刷新：仅用户手动触发，不做后台轮询或自动定时抓取。
- 聚焦：只围绕产品研究（`PRODUCT_SELECTION`）能力，不新增底层接口。

数据流：

```text
用户点击刷新
  -> Web SDK selectSellerSpriteProducts(input)
  -> 得到最小化产品列表 envelope
  -> analytics 归一化为历史快照 (snapshot)
  -> IndexedDB 持久化 (append-only)
  -> analytics 按 ASIN 构建时间序列
  -> 趋势分析结果
  -> 趋势工作台 UI 渲染
```

## 3. 模块边界

### 3.1 纯函数分析核心 `packages/analytics`

新增 workspace 包，无副作用、无 IO、无 DOM 依赖，只做数据变换：

- 定义历史快照领域模型（`ProductSnapshot`、`ProductObservation`、`ProductSeries`、`ProductTrend`）。
- 把 Phase 9 冻结的 `SellerSpriteProductSelectionData`（`{ page, pages, size, total, hasNextPage, items[] }`，item 8 字段）归一化为一次带时间戳的快照。
- 按 ASIN 把多次快照重组为时间序列。
- 计算趋势：首末对比、绝对/相对变化、方向（上升/下降/持平）、缺失点处理。
- 只消费 Phase 9 已冻结字段，不猜测未知字段，不透传原始对象。

### 3.2 IndexedDB 持久化层 `apps/web/src/store`

- 定义 IndexedDB schema（数据库名、版本、object store、索引）。
- append-only 写入快照，读取全部/按查询条件读取快照。
- 仅存储 analytics 归一化后的最小快照结构，不存储原始 HTML、Cookie、凭据或未知字段。
- 封装为 Promise API，屏蔽 IndexedDB 事件模型，便于纯函数与 React 层消费。

### 3.3 手动刷新数据流与 UI `apps/web/src`

- 一个手动刷新 hook：触发 SDK 调用、写入 store、重建时间序列，全程只在用户操作时执行。
- 一个历史趋势工作台组件：产品研究查询输入、刷新按钮、当前快照列表、历史趋势对比视图。
- 接入现有 `App.tsx`，与扩展检测/Target 授权/登录检查并列，不破坏既有 UI。

## 4. 数据模型

### 4.1 ProductSnapshot（一次刷新）

```text
ProductSnapshot {
  snapshotId: string        // 生成的唯一 ID
  capturedAt: number        // epoch ms，捕获时刻
  market: string            // 来自查询输入
  selectType: string        // 来自查询输入
  page: number              // envelope 分页元数据
  total: number
  observations: ProductObservation[]
}
```

### 4.2 ProductObservation（快照内单个产品）

只保留 Phase 9 冻结的 8 字段：

```text
ProductObservation {
  asin: string
  title: string | null
  brand: string | null
  imageUrl: string | null
  price: number | null
  rating: number | null
  reviews: number | null
  estimatedSales: number | null
}
```

### 4.3 ProductSeries / ProductTrend（跨快照）

```text
ProductSeries {
  asin: string
  points: { capturedAt: number; observation: ProductObservation }[]  // 按时间升序
}

ProductTrend {
  asin: string
  title: string | null
  metric: 'price' | 'rating' | 'reviews' | 'estimatedSales'
  first: number | null
  last: number | null
  absoluteChange: number | null
  relativeChange: number | null      // 比例，null 表示基期缺失或为 0
  direction: 'up' | 'down' | 'flat' | 'unknown'
  sampleCount: number
}
```

## 5. IndexedDB Schema

- 数据库：`cookie-amazon-analytics`，版本 `1`
- object store：`product-snapshots`，`keyPath = 'snapshotId'`
- 索引：`by-capturedAt`（`capturedAt`）、`by-market`（`market`）
- 写入策略：append-only，不覆盖历史；删除仅提供全量清空（后续切片可扩展按条件删除）

## 6. 安全与边界约束

- 不新增任何 `{ url, headers, body }` 通用调用入口；只调用 Phase 9 命名 API。
- 不存储、日志记录或跨层返回原始 HTML、Cookie、凭据。
- IndexedDB 仅保存归一化后的最小字段；未知字段在 analytics 归一化阶段被丢弃。
- 手动刷新：无自动轮询、无 setInterval、无后台抓取。
- analytics 为纯函数，全部单元测试不触网、不依赖 IndexedDB。
- store 层测试使用 `fake-indexeddb`，不依赖真实浏览器与真实 SellerSprite 会话。

## 7. 验收标准

- 产品研究结果能被手动刷新保存为带时间戳的历史快照并持久化到 IndexedDB。
- 同一 ASIN 跨多次快照可构建时间序列并计算 `price/rating/reviews/estimatedSales` 趋势。
- analytics 纯函数与 store 层均有独立单元测试并通过。
- Web UI 可触发刷新、展示当前快照、展示历史趋势对比。
- 全仓库 typecheck/test/build 通过；不覆盖受保护的未提交改动。