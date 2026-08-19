# Phase 11 产品研究工作台增强 设计

## 1. 背景与目标

Phase 10 已交付产品研究工作台：手动刷新 → `selectSellerSpriteProducts` → `toSnapshot`
→ IndexedDB 持久化 → `buildSeries`/`computeTrends` → 单指标趋势表。

Phase 11 在不新增任何底层接口的前提下，增强既有工作台的分析体验：

1. 多 ASIN 对比：选中若干 ASIN，并列查看其各指标趋势。
2. 趋势可视化：每个序列以内联 SVG 迷你折线图（sparkline）呈现，不引入第三方图表库。
3. 排序/筛选：趋势表支持按列排序、按方向/最小样本/关键字筛选。
4. CSV 导出：把当前趋势表与快照序列导出为 CSV，浏览器本地下载。

## 2. 约束

- 复用 Phase 9/10 已冻结契约：只调用 `selectSellerSpriteProducts`，不新增
  `{ url, headers, body }` 通用入口，不采集网页证据，不透传原始 HTML。
- 不猜测未观察字段；分析只基于 analytics 已冻结的 8 字段观测值。
- 保持函数式 + DSL 风格：排序、筛选、CSV 序列化、sparkline 点位计算全部是
  `packages/analytics` 中的纯函数，无 IO/DOM 依赖。
- 不引入图表库；可视化用纯函数计算归一化点位 + 内联 SVG 渲染。
- 不做后台自动刷新、定时轮询、云端同步；刷新仍只由用户触发。
- 不覆盖工作区中受保护的未提交改动。

## 3. 分析核心增强（packages/analytics）

新增纯函数，均无副作用、可被 vitest 独立覆盖：

- `sortTrends(trends, key, direction)`：按 `asin | title | first | last |
  absoluteChange | relativeChange | sampleCount` 排序。`null` 值统一排在末尾，
  排序稳定。
- `filterTrends(trends, criteria)`：`criteria` 支持 `direction`（可选，精确匹配）、
  `minSampleCount`（可选下限）、`query`（可选，对 asin/title 大小写不敏感子串匹配）。
- `toSparkline(series, metric, options)`：把一条 `ProductSeries` 的指定 metric
  归一化为 `{ points: string; width; height; hasData }`，`points` 为 SVG
  `polyline` 可用的 `"x,y x,y"` 字符串；缺失值跳过；样本 <2 时 `hasData=false`。
- `trendsToCsv(trends, metric)`：把趋势表序列化为 CSV 文本（含表头行），对含逗号/
  引号/换行的字段做 RFC4180 转义。
- `seriesToCsv(seriesList, metric)`：把多序列的时间点展开为长表 CSV
  （asin,title,capturedAt,value）。

领域类型新增 `TrendSortKey`、`SortDirection`、`TrendFilterCriteria`、`Sparkline`。

## 4. Web 工作台增强（apps/web）

- `useProductResearch` 保持刷新数据流不变；派生数据（排序/筛选后的趋势、sparkline、
  CSV 文本）在组件层用 analytics 纯函数计算，不改动持久化。
- 新增 `csv.ts` 小工具：`downloadCsv(filename, text)`，用 `Blob` + 临时 `<a>`
  触发本地下载（唯一的 DOM 副作用，隔离在 UI 层）。
- 工作台交互：
  - 表头点击切换排序列与升/降序。
  - 筛选控件：方向下拉、最小样本输入、ASIN/标题关键字输入。
  - 每行末列渲染内联 SVG sparkline。
  - 多选 ASIN（行内 checkbox）后展示对比区：并列各指标首末值与 sparkline。
  - “导出 CSV”按钮：导出当前（筛选/排序后）趋势表；“导出序列”按钮：导出展开序列。
- 无数据、单样本、加载中、错误码等边界沿用 Phase 10 的 `role=status`/`role=alert`。
- 样式：在 web 现有样式文件补充 `.pr-trends` 排序表头、`.pr-filters`、
  `.pr-sparkline`、`.pr-compare` 等类，保持可访问性（表头 `aria-sort`、按钮可聚焦）。

## 5. 测试

- analytics：`sortTrends`（各 key、方向、null 末尾、稳定性）、`filterTrends`（各条件
  与组合、空结果）、`toSparkline`（无数据/单点/多点/缺失值/归一化边界）、
  `trendsToCsv`/`seriesToCsv`（表头、转义、空输入）。
- apps/web：`csv.ts` 序列化与 workbench 关键渲染（排序切换、筛选生效、导出按钮存在）
  可用 vitest + 现有测试基建覆盖；不使用真实 SellerSprite 会话。

## 6. 提交切分

1. `packages/analytics` 排序/筛选/CSV/sparkline 纯函数 + 测试。
2. `apps/web` 工作台增强（UI + csv 工具 + 样式）+ 测试，接入既有 workbench。

## 7. 不在本阶段范围

- 不引入图表库或重型可视化依赖。
- 不接入关键词挖掘/市场/HTML 能力的历史分析。
- 不新增底层接口、后台刷新、云端同步、原始 HTML/Cookie 持久化。