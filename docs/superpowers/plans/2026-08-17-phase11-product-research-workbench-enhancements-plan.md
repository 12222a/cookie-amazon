# Phase 11 产品研究工作台增强 实施计划

## 1. 当前状态

- 阶段：Phase 11
- 状态：进行中
- 当前优先级：在 Phase 10 工作台基础上增强分析体验——多 ASIN 对比、内联
  SVG 趋势可视化、排序/筛选、CSV 导出。
- 不新增底层接口；只复用 `selectSellerSpriteProducts` 与既有 analytics/store。

## 2. 实施顺序

### 任务 1：analytics 分析增强（纯函数）

- `packages/analytics/src/index.ts` 新增：
  - 类型 `TrendSortKey`、`SortDirection`、`TrendFilterCriteria`、`Sparkline`。
  - `sortTrends(trends, key, direction)`：稳定排序，`null` 末尾。
  - `filterTrends(trends, criteria)`：direction / minSampleCount / query 组合筛选。
  - `toSparkline(series, metric, options?)`：归一化 SVG polyline 点位。
  - `trendsToCsv(trends, metric)`、`seriesToCsv(seriesList, metric)`：RFC4180 转义。
- vitest 覆盖各函数的正常/边界/空输入路径。

验收：全部为纯函数，无 IO/DOM 依赖，测试全通过；typecheck、lint 干净。

### 任务 2：Web 工作台增强并接入

- `apps/web/src/product-research/csv.ts`：`downloadCsv(filename, text)`（Blob + 临时 a）。
- 增强 `ProductResearchWorkbench.tsx`：
  - 表头排序（`aria-sort`）、筛选控件（方向/最小样本/关键字）。
  - 行内 sparkline（内联 SVG）、多选 ASIN 对比区。
  - 导出趋势 CSV / 导出序列 CSV 按钮。
- 派生数据在组件层用 analytics 纯函数计算，不改 `useProductResearch` 持久化流。
- 补充 web 样式（排序表头、筛选、sparkline、对比区），保持可访问性。
- vitest 覆盖 csv 工具与关键渲染行为。

验收：交互可用，边界（无数据/单样本/加载/错误）稳健；不使用真实会话测试。

### 任务 3：验证与交付

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

逐能力真实提交并推送 main，核验 SHA、`origin/main`、分支与工作区状态。
选择性 git add，排除受保护的未提交文件。

## 3. 提交切分

1. `packages/analytics` 排序/筛选/CSV/sparkline 纯函数 + 测试。
2. `apps/web` 工作台增强（UI + csv 工具 + 样式）+ 测试。

## 4. 当前切片完成标准

- [ ] analytics 排序/筛选/CSV/sparkline 纯函数与测试。
- [ ] web 工作台多 ASIN 对比、sparkline、排序/筛选、CSV 导出与测试。
- [ ] 全仓库 typecheck/test/build 通过并逐能力提交推送。

## 5. 不在当前切片完成的事项

- 不引入图表库或重型可视化依赖。
- 不接入关键词挖掘/市场/HTML 能力的历史分析。
- 不新增底层接口、后台刷新、云端同步、原始 HTML/Cookie 持久化。