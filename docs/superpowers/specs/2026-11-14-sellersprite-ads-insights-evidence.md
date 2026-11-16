# SellerSprite 广告洞察接口与网页证据

## 证据状态

- 采集日期：2026-11-14
- 来源：SellerSprite 官方 MCP 文档、官网公开前端 JavaScript，以及用户已登录的浏览器页面。
- 脱敏：不记录 Cookie、Authorization、Session、账号信息、完整请求参数值或完整响应。
- 已确认：官方 MCP 工具名称及输入字段；官网前端声明的固定 API 路径、方法和部分参数；登录后的网页查询结果。
- 待验证：网页 API 的实际 HTTP 状态码、原始响应结构、失败响应和认证过期行为。公开源码中的响应字段访问不等同于已捕获的 HTTP 响应。

## 官方已有 MCP 工具

- 官方工具名称：`ads.insights.lookup`（竞品广告洞察）。
- 官方核心输入字段：`asin`、`marketplace`、`interval`；官方 interval 使用 `WEEK` / `MONTH`，默认月。
- 官方可选筛选与分页包括 `months`、`campaignId`、`adId`、`type`、`variation`、`startDate`、`endDate`、`combination`、`desc`、`page.cursor`、`page.size`。它们与网页 API 的命名、大小写、默认值和分页方式需分别处理。
- 文档列出的信息包括广告活动、广告组、关键词规模和历史架构信息；不可据此声称能读取竞品真实预算、实际 CPC、ACOS 或实际成交数据。
- 官方接入使用其 MCP/API Key 及官方额度规则，与本仓库通过浏览器会话执行固定操作的本地 MCP 是两条接入路径。
- 文档来源：`https://www.sellersprite.com/v3/knowledge/feature/mcp-interface-description`，定位工具名 `ads.insights.lookup`。本次只查询公开文档，没有创建密钥、购买额度或调用官方收费服务。

## 官网公开代码中的接口

以下来自官网直接公开提供的前端脚本，未附加用户认证信息下载。证据类型为静态代码，不是网络抓包。

| Method | 固定 pathname | 代码用途 |
| --- | --- | --- |
| GET | `/v3/api/xds/stat` | 广告架构列表及筛选项；筛选项查询增加 `brief` |
| GET | `/v3/api/xds/stat/history` | 广告组的可用历史时间段 |
| GET | `/v3/api/xds/stat/keyword` | 广告组关键词明细 |
| GET | `/v3/api/xds/stat/keyword/high-frequency` | 高频词；已确认客户端函数声明，尚未实测 |

公开配置将 `adsUrl` 定义为 `/v3/api/xds`；广告模块 `f8d6` 将上述路径后缀交给请求封装，并显式指定 `GET` 和 `params`。

广告架构查询的代码参数名：

```text
asin, market, interval, desc, pageNum, pageSize, orderByEffectiveness,
type, campaignId, adId, variation, months, combination
```

筛选项请求另加 `brief`。构造器移除 undefined、null 和空字符串，保留 false；页面地址中的 `q`、`marketId` 对应此处的 `asin`、`market`，不能原样把网页路由参数当成 API 参数。

历史时间段查询代码参数：`asin`、`market`、`interval`、`adId`，及页面提供时的 `months`。

关键词明细传入的表单字段：`adId`、`interval`、`beginDate`、`endDate`、`pageSize`、`pageNum`、`keyword`、`orderField`、`desc`、`market`。

页面代码读取了架构数据的 `groups`、`campaigns`、`adIdList`、`variations`，及关键词数据的 `items`、`total`。这些仅证明客户端依赖这些字段，不是完整、实测的响应 schema；官方 MCP 文档的返回 schema 也不能直接视作这些网页 API 的 schema。

### 公开脚本定位

- 配置与路由：`https://www.sellersprite.com/v3/webapp/static/js/app.fe8d48c7351f.js`。搜索 `adsUrl` 和 `ads-insights`。
- 主页面及 API 封装：`https://www.sellersprite.com/v3/webapp/static/js/chunk-0b67a221.26c0e9f5116a.js`。搜索 `f8d6`、`initAds`、`getAdsFilters`。
- 关键词明细：`https://www.sellersprite.com/v3/webapp/static/js/chunk-471b878e.43656b2d56aa.js`。搜索 `initKeyword`、`initTime`、`form:`。
- 当日下载文件 SHA-256（静态资源版本会变化）：

```text
app:        0B0B9046F84CFEB279ECF7E0425283A62B9B73A76CB8CA606CB02175F9109266
ads-main:   1D11E3306F604376E5703E3A21ACEAE7729C8D9E8F0FD6B40390324C8698C677
ads-detail: 95DDE3FB0EDF8B416F561FFD4B4248016D9FEA636B2994CB65A943B983D899C7
```

## 页面与筛选

- 页面：`GET /v3/ads-insights`（状态码未观测）
- 查询后浏览器地址包含筛选字段：`q`、`marketId`、`interval`、`months`、`pageNum`、`pageSize`。
- 查询值（ASIN、市场、时间范围和分页值）不在本文保存。
- 界面控件：站点、周/月间隔、广告类型、广告活动、广告组、所属变体、排序、时间范围、同广告活动合并选项、导出按钮。
- 页面说明：广告洞察通过产品及其变体的广告活动、广告组和搜索关键词反推竞品广告架构；当前覆盖 SP、SBV 关键词投放，不包括商品投放、SB 或 SD。

## 已执行查询

- 使用页面公开示例 ASIN，在美国站的默认按周、近 6 个月条件下点击“立即查询”。
- 数据加载完成后，页面显示 290 个投放小组（289 个 SP、1 个 SBV），属于 224 个广告活动，并展示广告组与周时间轴。
- 更正：此前记录的 0 和“暂无相关数据”来自尚未完成加载的中间状态，不能作为查询结论。
- 本结果证明登录会话中的页面能查询到该公开示例的广告架构，不提供 API 原始响应结构，也不保证其他 ASIN 都有数据。

## 网络捕获状态

- 本次 ProxyPin 列表未捕获 SellerSprite 的业务请求；“无环境”是其界面标签，不能据此断言系统代理或 HTTPS 代理未启用。
- API pathname、method 和上文参数现已从官网公开代码确认；仍未捕获实际请求头、状态码或原始响应。
- 后续可在浏览器 Network 面板或经配置的 ProxyPin 中观察上述固定路径，只保存脱敏后的 origin/path、method、字段名、状态码及响应键结构。不必导出 Cookie 或完整 HAR。

## MCP 接入结论

- 本仓库现有 `sellersprite_asin_ad_analysis` 是从关键词反查数据计算广告位摘要，不等同于此处的广告洞察。
- 本次完成网上接口定位与记录，尚未把广告洞察加入本仓库 MCP 工具清单。
- 若继续使用现有本地 MCP + 扩展方案，按上述固定路径补充适配；先验证实际响应、分页和错误行为，再添加返回字段验证及协议白名单。
