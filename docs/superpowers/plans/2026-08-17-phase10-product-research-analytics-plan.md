# Phase 10 产品研究数据工作台与历史趋势分析 实施计划

## 1. 当前状态

- 阶段：Phase 10
- 状态：进行中
- 当前优先级：在 Web 端接入 Phase 9 已冻结的产品研究能力，落地本地 IndexedDB 历史快照、用户手动刷新数据流与历史趋势分析工作台。
- 不新增任何底层接口；只复用 `selectSellerSpriteProducts`。

## 2. 实施顺序

### 任务 1：纯函数分析核心 `packages/analytics`

- 新增 workspace 包（`package.json`、`tsconfig.json`、`src/index.ts`）。
- 定义 `ProductSnapshot`、`ProductObservation`、`ProductSeries`、`ProductTrend` 领域模型。
- `toSnapshot(data, meta)`：把 `SellerSpriteProductSelectionData` 归一化为一次带时间戳快照，只保留冻结的 8 字段。
- `buildSeries(snapshots)`：按 ASIN 聚合为时间序列，按 `capturedAt` 升序。
- `computeTrends(series, metric)`：计算首末对比、绝对/相对变化、方向。
- vitest 覆盖：空数据、单快照、多快照、缺失字段、基期为 0、方向判定。

验收：analytics 为纯函数，无 IO/DOM 依赖，测试全通过。

### 任务 2：IndexedDB 持久化层 `apps/web/src/store`

- 定义 schema：`cookie-amazon-analytics` v1，store `product-snapshots`，索引 `by-capturedAt`、`by-market`。
- `openDatabase()`、`putSnapshot(snapshot)`、`listSnapshots()`、`clearSnapshots()`，均返回 Promise。
- 只持久化 analytics 归一化后的最小快照结构。
- 增加 `fake-indexeddb` 为 devDependency；apps/web 增加 `test` 脚本与 vitest 环境配置。
- vitest 覆盖：写入后可读回、append-only、按时间排序、清空。

验收：store 层测试使用 `fake-indexeddb` 通过，不依赖真实浏览器。

### 任务 3：手动刷新数据流 hook

- `useProductResearch`：管理查询输入、加载状态、错误码、当前快照与历史序列。
- 刷新动作：调用 SDK -> 归一化 -> 写 store -> 读全部快照 -> 重建序列，仅用户触发。
- 错误映射：`WebSdkError.code` 直接透出，不吞错。

验收：刷新只在用户操作时执行，无自动轮询。

### 任务 4：历史趋势工作台 UI 并接入 `App.tsx`

- 查询输入（market、selectType、size 等冻结输入的最小子集）与刷新按钮。
- 当前快照产品列表（ASIN、标题、价格、评分、评论、预估销量）。
- 历史趋势对比视图（按 ASIN + metric 展示首末值、变化、方向）。
- 作为独立 section 接入现有 `App.tsx`，不破坏扩展检测/授权/登录既有 UI。
- 补充 `style.css` 样式。

验收：UI 可触发刷新、展示当前快照与历史趋势。

### 任务 5：验证与交付

最小命令：

```text
pnpm --filter @cookie-amazon/analytics typecheck
pnpm --filter @cookie-amazon/analytics test
pnpm --filter @cookie-amazon/web typecheck
pnpm --filter @cookie-amazon/web test
pnpm --filter @cookie-amazon/web build
```

完成后执行：

```text
pnpm -r typecheck
pnpm -r test
pnpm -r build
git diff --check
```

逐能力真实提交并推送 main，核验 SHA、`origin/main`、分支与工作区状态。不使用真实 SellerSprite 会话执行自动测试。

## 3. 提交切分

1. `packages/analytics` 纯函数核心 + 测试。
2. `apps/web` IndexedDB store + 测试基础设施。
3. 手动刷新 hook + 趋势工作台 UI + `App.tsx` 接入。

## 4. 当前切片完成标准

- [ ] analytics 纯函数核心与测试。
- [ ] IndexedDB 持久化层与 `fake-indexeddb` 测试。
- [ ] 手动刷新数据流 hook。
- [ ] 历史趋势工作台 UI 并接入 App。
- [ ] 全仓库 typecheck/test/build 通过并逐能力提交推送。

## 5. 不在当前切片完成的事项

- 不新增底层 SellerSprite 接口或通用调用入口。
- 不做后台自动刷新、定时轮询或云端同步。
- 不持久化原始 HTML、Cookie 或凭据。
- 不接入关键词挖掘/竞品/HTML 能力的历史分析（后续阶段）。
- 不引入图表库；首个切片用轻量表格/内联可视化，图表可后续增强。