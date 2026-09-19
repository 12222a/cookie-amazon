# SellerSprite 服装相关末级类目清单

> 数据来源：已登录 SellerSprite 会话通过 `GET /v2/competitor-lookup/nodes` 抓取。完整的逐节点原始记录保存在项目根目录 [`category-crawl.json`](../category-crawl.json)；本文件记录抓取范围、递归规则和可直接用于选品的叶子类目索引，避免手工复制 230 条记录后与原始数据产生漂移。

## 抓取统计

| 项目 | 数值 |
| --- | ---: |
| 市场 | US（`marketld=1`） |
| 数据表 | `bsr_sales_nearly` |
| 根类目 | 5 |
| 访问节点数 | 57 |
| 节点记录数 | 282 |
| 末级叶子节点（`children = 0`） | 230 |
| 非叶子节点（`children > 0`） | 52 |
| 抓取失败 | 0 |

## 根类目范围

根类目均位于 `Clothing, Shoes & Jewelry`（ID `7141123011`）下：

| 根类目 | 起始 `nodeIdPath` |
| --- | --- |
| Costumes & Accessories | `7141123011:7586165011` |
| Scary Halloween Costumes | `7141123011:15607776011` |
| Women's Costumes - Superheroes | `7141123011:21393261011` |
| Traditional & Cultural Wear | `7141123011:7586166011` |
| Novelty & More | `7141123011:7147445011` |

## 递归和选品规则

1. 首次请求不带 `nodeIdPath`，读取当前节点的 `items`。
2. 对每个节点使用完整路径递归请求，例如：`7141123011:7586165011:14194728011`。
3. `children = 0` 才是可选的末级叶子类目；`children > 0` 的节点只用于继续展开。
4. 产品选品请求 `POST /v3/api/product-research` 的 `nodeIdPaths` 必须传完整的叶子路径，不能只传最后一级 ID。
5. 当前前端直接展示已记录的 230 个叶子类目，只有选中的节点 `children = 0` 时才允许开始自动研究。

## 用户关注主题覆盖

抓取结果覆盖以下与用户经营方向直接相关的分支：

- 节日和角色扮演服装：`Costumes & Accessories`、`Scary Halloween Costumes`、`Women's Costumes - Superheroes`。
- 服装配件：男女装扮服饰下的 `Accessories`、`Headwear`、`Eyewear`、`Accessory Sets`、`Masks`、`Wigs` 和 `Footwear` 等叶子分支。
- 中世纪/历史主题装备与配件：`Props` 下的 `Weapons & Armor`、`Wands`、`Walking Sticks & Canes`，以及相关服饰、头饰、面具和鞋靴叶子分支。
- 传统和文化服饰：`Traditional & Cultural Wear` 根分支。
- 新奇服装及配件：`Novelty & More` 下已抓取的服装、帽饰、手套、睡衣、情趣服装和其他服装相关叶子分支。

## 已核对的完整路径示例

下列路径用于验证“完整路径”和“叶子约束”均按接口真实返回值处理；完整 230 条叶子记录请以 [`category-crawl.json`](../category-crawl.json) 中 `records[].children = 0` 为准。

| 叶子类目 | 中文路径 | 完整 `nodeIdPath` |
| --- | --- | --- |
| Men › Costumes & Cosplay Apparel › Costumes | 服装、鞋履和珠宝 › 服装和配饰 › 男士 › 装扮服饰和角色扮演服饰 › 装扮服饰 | `7141123011:7586165011:14194728011:14194729011:14194730011` |
| Women › Accessories › Accessory Sets | 服装、鞋履和珠宝 › 服装和配饰 › 女士 › 配饰 › 配饰套装 | `7141123011:7586165011:14194713011:14194724011:14194725011` |
| Men › Accessories › Headwear › Helmets | 服装、鞋履和珠宝 › 服装和配饰 › 男士 › 配饰 › 头饰 › 头盔 | `7141123011:7586165011:14194728011:14194738011:14194741011:66534773011` |
| Props › Weapons & Armor | 服装、鞋履和珠宝 › 服装和配饰 › 道具 › 武器和盔甲 | `7141123011:7586165011:14194766011:14194770011` |
| Props › Wands | 服装、鞋履和珠宝 › 服装和配饰 › 道具 › 魔杖 | `7141123011:7586165011:14194766011:14194769011` |

## 完整数据的筛选方式

`category-crawl.json` 是完整清单的单一事实来源。筛选全部叶子节点时使用：

```text
records.filter(record => record.children === 0)
```

每条叶子记录都包含 `id`（完整路径）、`label`、`labelLocale`、`labelPathLocale`、`products` 和 `children`。其中 `id` 就是产品选品请求应传入的 `nodeIdPaths[0]` 值。

## 覆盖边界

本次数据覆盖上表列出的 5 个用户关注根分支及其递归结果，共 230 个叶子节点；其中 `Scary Halloween Costumes` 和 `Women's Costumes - Superheroes` 本身就是 `children = 0` 的根级叶子类目，已纳入选品清单。它不是整个 Amazon `Clothing, Shoes & Jewelry` 树的无差别全量抓取；未列入根类目范围的其他一级分支不应被解释为已完成扫描。使用 SellerSprite 页面后应关闭已打开的 SellerSprite 页面。