# Phase 8 产品目标与卖家精灵目标规格

## 1. 文档状态

- 阶段：Phase 8
- 状态：已完成；网页会话接口证据已确认并进入 Phase 9
- 第一个目标：卖家精灵（SellerSprite）
- 目标网站：`https://www.sellersprite.com`
- 首批能力：登录状态检测、关键词反查相关能力
- 当前结论：真实网页会话 Endpoint、Method、字段名、响应键结构和浏览器 Cookie 自动携带方式已经脱敏确认；完整证据见 `2026-08-17-sellersprite-web-contract-evidence.md`。Phase 9 已开始实现受限 Cookie Adapter。

## 2. 背景与目标

当前平台已经具备 Web、Chrome Extension、Target Registry、Target Permission、Target Policy、Target Client 和 RemoteConfig 基础能力，但现有 Target 仍是 `example.com` 演示目标。

本阶段不把系统改造成任意网站代理，而是确定一个真实、固定、可审计的目标网站和业务流程，为下一阶段真实 Adapter 接入提供明确契约。

用户确认的主要流程：

```text
用户打开 Web 网站
    ↓
Web 网站检测 Chrome Extension
    ↓
Extension 检测卖家精灵是否登录
    ↓
后续执行卖家精灵的已确认业务操作
```

## 3. 已确认的产品范围

### 3.1 目标网站

| 项目 | 决定 |
|---|---|
| 产品目标 | 卖家精灵网站 |
| 官方网站 | `https://www.sellersprite.com` |
| 目标 Origin | `https://www.sellersprite.com` |
| 候选 Target ID | `sellersprite` |
| 第一阶段目标 | 检查卖家精灵登录状态，并为关键词反查建立安全接口契约 |

`Target ID` 和真实 Adapter 仍需在 Phase 9 实现时最终冻结；本阶段不修改 Registry。

### 3.2 用户流程

1. 用户访问 Cookie Amazon Web 网站。
2. Web 网站通过 Web SDK 检测扩展是否安装并可通信。
3. 用户选择卖家精灵目标。
4. 扩展检查卖家精灵登录状态。
5. 如果未登录，Web 网站提示用户登录卖家精灵。
6. 如果已登录，才允许进入后续关键词反查流程。
7. 关键词反查请求必须使用已确认的固定 Endpoint 和固定响应 Schema。

### 3.3 首批业务能力

| 能力 | 内部 Operation 候选 | 当前状态 |
|---|---|---|
| 登录检测 | `CHECK_LOGIN` | 已有通用协议能力，等待卖家精灵登录接口确认 |
| 关键词反查 | `KEYWORD_REVERSE` | 业务已确认，接口和权限未确认，暂不编码 |

当前平台已有 `CHECK_LOGIN`、`GET_PROFILE` 两个静态 Operation。`KEYWORD_REVERSE` 不能通过 RemoteConfig 动态增加，必须在后续代码变更中静态注册，并经过接口和响应契约评审。

### 3.4 独立能力模块

已新增独立 workspace 包：

```text
packages/sellersprite/
├── src/index.ts
└── src/__tests__/index.test.ts
```

包名：`@cookie-amazon/sellersprite`。

该模块只负责：

- 卖家精灵固定 Target ID 和 Origin 元数据。
- 卖家精灵能力标识和中文展示名。
- 能力分类和只读目录查询。
- 后续 Adapter 所需的领域契约边界。

当前已登记能力：

| 能力标识 | 展示名 | 分类 | 接口状态 |
|---|---|---|---|
| `CHECK_LOGIN` | 登录状态检测 | account | 网页会话接口待确认 |
| `KEYWORD_REVERSE` | 关键词反查 | keyword | 官方 API 已确认，客户端认证待定 |
| `COMPETITOR_RESEARCH` | 查竞品 | competitor | 官方 API 已确认，客户端认证待定 |
| `PRODUCT_SELECTION` | 选产品 | product | 官方 API 已确认，客户端认证待定 |
| `MARKET_SELECTION` | 选市场 | market | 官方 API 已确认，客户端认证待定 |
| `KEYWORD_PRODUCT_RESEARCH` | 关键词选品 | keyword | 官方 API 已确认，客户端认证待定 |
| `KEYWORD_MINING` | 关键词挖掘 | keyword | 官方 API 已确认，客户端认证待定 |

该包不依赖 Extension Background、Web SDK 或 Config Worker；不存储 Cookie、Session、Authorization、API Key、任意 URL 或猜测的私有 Endpoint。能力登记不代表真实接口已经实现。

## 4. 外部事实与接口边界

### 4.1 官方页面事实

官方站点提供关键词反查相关页面，例如：

```text
https://www.sellersprite.com/v3/keyword-reverse?q=<value>&marketId=<value>
```

该地址是 JavaScript 应用页面，不等于已确认的后端 API Endpoint。通过静态页面访问只能确认页面存在，不能确认：

- 实际请求 Method。
- 实际数据 API Path。
- 请求参数名称和类型。
- 是否需要登录。
- 是否需要订阅权限。
- 响应 JSON Schema。
- 401、403、429 和 5xx 行为。

因此，不能直接把 `/v3/keyword-reverse` 当作 `TargetClient` 的数据接口。

### 4.2 官方开放 API 事实与已确认契约

卖家精灵公开 API 文档确认：

- API Gateway Origin：`https://api.sellersprite.com`。
- 请求需要 `secret-key` Header；该凭据不能进入扩展、Web、RemoteConfig 或 KV。
- 请求建议包含唯一的 `x-request-id`。
- 公共响应字段为 `code`、`message`、`data`。
- 公共错误码包括 `ERROR_URL_NOT_FOUND`、`ERROR_SERVER_INTERNAL`、`ERROR_PARAM`、`ERROR_SECRET_KEY`、`ERROR_SECRET_KEY_OVERDUE`、`ERROR_VISIT_MAX` 和 `ERROR_SECRET_KEY_INVALID`。

已确认的 Reverse ASIN（关键词反查）契约：

```text
POST https://api.sellersprite.com/v1/traffic/keyword
```

最小必需输入：

```json
{
  "marketplace": "US",
  "asin": "B07Z82895W"
}
```

文档还确认可选的 `keyword`、`month`、`badges`、关键词类型筛选、`page`、`size` 和 `order` 参数；`size` 默认 200，最大 200。主要成功数据字段为 `marketplace`、`asin`、`total` 和 `items`，条目包含 `keywords`，并可包含搜索量、购买量、转化率、竞价、流量占比、关键词类型和更新时间等字段。

已确认的 Keyword Mining 契约：

```text
GET https://api.sellersprite.com/v1/keyword/miner
```

必需输入为 `marketplace` 和 `keyword`，可选输入包括历史月份、筛选条件、分页和排序。文档成功数据包含关键词、搜索量、购买量、产品数、搜索排名和 SellerSprite 排名等字段。

这些是官方 API 契约，不代表当前扩展可以直接调用：API Key 只能由受控服务端托管。官方文档没有确认本项目可使用的网页会话登录检测 Endpoint，也没有授权本项目把 API Key 下发到客户端。因此当前不能实现 `https://www.sellersprite.com` 网页会话 Adapter，也不能新增未设计的 Worker 代理。

参考资料：

- [SellerSprite 官方网站](https://www.sellersprite.com)
- [SellerSprite API 说明](https://www.sellersprite.com/en/help/about-api)
- [SellerSprite 开放 API](https://open.sellersprite.com/api)
- [SellerSprite API 文档入口](https://sellersprite.github.io/)

### 4.3 网页接口确认状态

已通过官方 Playwright MCP 复用 Chrome 会话并执行真实网页操作，确认以下能力的网页契约：

- 登录状态检测：`GET /v2/me`，HTML 正向探测。
- 关键词反查：`/v3/api/relation/*` 固定 JSON Endpoint 集合。
- 查竞品：`POST /v3/api/competing-lookup`。
- 选产品：`POST /v3/api/product-research`。
- 选市场：`POST /v2/market-research`，HTML 表单响应。
- 关键词选品：`GET /v2/keyword-research`，HTML 页面响应。
- 关键词挖掘：`/v3/api/keyword-miner*` 与 `/v3/api/suggestions` 固定 JSON Endpoint 集合。

脱敏证据统一保存在 `2026-08-17-sellersprite-web-contract-evidence.md`。证据只包含 pathname、method、字段名、状态码、响应键结构和认证字段存在性，不包含凭据、参数值、完整请求头、完整响应或隐私数据。

官方 API 契约与网页会话契约仍是两套协议。Phase 9 只实现浏览器会话方案，不把官方 API 的 `secret-key` 放入客户端。

### 4.4 密钥安全决策

SellerSprite API 的 `secret-key` 不得放入以下位置：

- Chrome Extension 源码或构建产物。
- Web 页面 JavaScript。
- RemoteConfig。
- Cloudflare KV。
- 浏览器 Local Storage。
- URL、Query String 或普通日志。

原因：扩展和 Web 都运行在用户可查看的客户端环境中，放入其中的密钥无法保密。

在当前架构下，官方 API 有两种可行方向：

1. 使用卖家精灵网站自身的用户会话请求，由扩展向已授权的卖家精灵 Origin 发送 `credentials: include` 请求；这要求确认官方允许的页面接口和响应契约。
2. 增加受控的服务端 API 代理，并设计独立的用户身份、密钥托管、配额、审计和隐私方案；这超出当前 Phase 8 和现有“不传输目标网站凭据”的安全边界。

在没有明确选择前，不实现 API Key 代理，也不把 API Key 下发给客户端。

## 5. Phase 8 必须冻结的接口契约

### 5.1 登录检测契约

必须由用户或接口调研确认：

- 固定 Origin。
- 固定 Method。
- 固定 Path。
- 是否需要 `credentials: include`。
- 是否需要额外非敏感 Header。
- 成功响应 JSON 示例。
- 未登录响应示例。
- 401、403、429、5xx 行为。
- 是否会跳转到登录页。
- 是否需要 CSRF Token。
- 请求是否属于官方允许的网页功能调用。

推荐的内部结果仍然保持最小化：

```ts
type LoginCheckResult = {
  loggedIn: boolean
}
```

不得把目标网站的完整用户对象返回给 Web 页面。

### 5.2 关键词反查契约

业务输入候选：

```ts
type KeywordReverseInput = {
  asin: string
  marketId: number
}
```

上述字段仅是产品候选模型，不代表已确认的目标 API 参数。正式实现前必须确认：

- 输入是 ASIN、关键词，还是两者都支持。
- ASIN 格式、长度和大小写规则。
- Marketplace 的固定枚举，不允许任意 URL 或任意市场值。
- 分页、排序、筛选和结果数量上限。
- 是否需要登录或订阅权限。
- 正式 API Endpoint 和 HTTP Method。
- 成功响应字段及字段类型。
- 需要返回给 Web 的最小字段集合。
- 哪些字段属于敏感数据或不应暴露。
- 401、403、429、5xx、超时和非法 JSON 行为。

推荐的最小返回模型候选：

```ts
type KeywordReverseResult = {
  asin: string
  marketId: number
  items: readonly {
    keyword: string
    rank?: number
    searchVolume?: number
  }[]
}
```

该模型必须以官方文档或实际授权接口响应为准，不能根据页面展示内容自行猜测。

## 6. 安全决策

- [x] 目标网站固定为卖家精灵官方 Origin。
- [x] 不允许用户输入任意网站地址。
- [x] 不允许 RemoteConfig 下发任意 URL。
- [x] 不允许 RemoteConfig 创建 `KEYWORD_REVERSE`。
- [x] 不允许使用万能 Fetch 代理。
- [x] 不允许把 SellerSprite API Key 放入客户端。
- [x] 不向 Config Worker 上传卖家精灵 Cookie。
- [x] Web 页面只调用 Web SDK。
- [x] 卖家精灵官方 API Gateway Origin、Reverse ASIN 和 Keyword Mining Endpoint 已由公开文档确认。
- [x] 官方 API 的 `secret-key` 不进入客户端、Worker KV 或 RemoteConfig。
- [ ] 登录检测网页 Endpoint 待确认。
- [ ] 客户端调用官方 API 的服务端认证、用户身份、配额和审计方案待单独设计。
- [ ] 关键词反查是否使用官方 API 还是已授权网页会话接口待决策。
- [ ] 卖家精灵服务条款和自动化访问边界待确认。

## 7. 本阶段明确不做的内容

- 不实现猜测的卖家精灵私有 API。
- 不抓取或上传 Cookie、Session、Authorization。
- 不在扩展内嵌入 SellerSprite API Key。
- 不通过 Worker 代理卖家精灵 API。
- 不把 `/v3/keyword-reverse` 页面 URL 当作数据 API。
- 不新增任意网站支持。
- 不实现订单、卖家后台或其他未确认业务能力。
- 不在登录接口和数据接口未确认前替换 `example` Target。

## 8. Phase 8 完成标准

满足以下条件后，Phase 8 才能标记完成并进入 Phase 9：

- [ ] 产品目标确定为卖家精灵。
- [ ] 目标 Origin 和正式域名已确认。
- [ ] 用户流程已确认。
- [ ] 登录检测接口已确认。
- [ ] 关键词反查接口已确认，或已确认采用官方 API 并完成服务端方案设计。
- [ ] 输入参数和输出 Schema 已确认。
- [ ] 401、403、429、5xx、超时和非法响应行为已记录。
- [ ] 认证方式和密钥处理方式已确认。
- [ ] 服务条款和自动化访问边界已确认。
- [ ] 已确认不需要任意 URL、万能代理或客户端密钥。
- [ ] Phase 9 Adapter 实施范围已冻结。

## 9. 当前阻塞项

当前唯一实质阻塞是目标接口契约尚未确认。下一步需要提供以下任一方案的材料：

### 方案 A：使用卖家精灵网页会话

提供浏览器 DevTools Network 中已授权、可重复的请求信息：

- Request URL。
- Method。
- 非敏感请求参数。
- 不要复制 Cookie、Authorization、secret-key 或其他凭据。
- 脱敏后的成功响应。
- 脱敏后的未登录响应。
- 相关错误响应。

### 方案 B：使用卖家精灵官方 API

提供：

- 官方 API 产品和 Endpoint 文档。
- API Key 的服务端托管位置。
- 用户身份和配额方案。
- 是否允许本项目服务端代表用户请求。
- 不把真实 API Key 发到聊天或提交到仓库。

在材料未提供前，代码层面最多实现契约验证和测试夹具，不实现真实目标请求。