# Phase 8 产品目标与卖家精灵目标实施计划

## 1. 实施状态

- 阶段：Phase 8
- 当前状态：已完成；网页会话契约已确认，Phase 9 受限 Cookie Adapter 已开始实施
- 目标网站：卖家精灵（SellerSprite）
- 目标 Origin：`https://www.sellersprite.com`

Phase 8 是产品与目标契约确认阶段，不应在认证边界未确认前编写任意抓取逻辑或通用代理。

## 2. 任务顺序

1. 固定产品目标、目标域名和用户流程。
2. 确认卖家精灵登录检测接口。
3. 确认关键词反查的正式数据接口和权限模型。
4. 冻结输入、输出、错误码和超时契约。
5. 审查密钥、Cookie、Session 和服务端边界。
6. 形成 Phase 9 Adapter 的静态实现清单。
7. 更新生产路线图中的 Phase 8 状态。

## 3. 任务详情

### 任务 1：固定产品目标

- 目标：将第一个真实目标固定为卖家精灵。
- 目标 Origin：`https://www.sellersprite.com`。
- 用户流程：打开 Web 网站、检测扩展、检测卖家精灵登录状态。
- 首批业务候选：登录检测、关键词反查。
- 已登记但尚未实现接口的业务能力：查竞品、选产品、选市场、关键词选品、关键词挖掘。
- 验收：不再使用任意网站输入，不扩展为万能代理。

### 任务 2：确认登录检测接口

- 目标：找到官方允许、固定且可重复的登录状态检查方式。
- 需要记录：Method、Path、参数、是否携带目标站点会话、成功响应和未登录响应。
- 禁止记录：Cookie、Authorization、Session、CSRF Secret 等真实凭据。
- 验收：可以将结果压缩成 `{ loggedIn: boolean }`，并明确 401、403、429、5xx 和超时行为。

### 任务 3：确认关键词反查的正式数据接口和权限模型

- 已确认官方 Reverse ASIN 数据接口：`POST https://api.sellersprite.com/v1/traffic/keyword`。
- 已确认最小输入：`marketplace`、`asin`；已确认主要结果结构：`marketplace`、`asin`、`total`、`items`。
- 已确认公共响应字段和错误码，包括参数错误、密钥错误、密钥过期和访问次数超限。
- 同时确认官方 Keyword Mining 接口：`GET https://api.sellersprite.com/v1/keyword/miner`。
- 未确认本项目的 API Key 服务端托管方案，也未确认可用于扩展的网页登录私有接口。
- 禁止：猜测私有接口、使用任意 URL、绕过权限或把 API Key 放进客户端。
- 验收：官方数据契约已记录；认证方案必须在服务端方案或已授权网页会话方案中二选一后才能实现。

### 任务 4：确认其余业务能力的网页契约

用户要求的其余能力包括：

- 查竞品
- 选产品
- 选市场
- 关键词选品
- 关键词挖掘

目前只能确认产品页面和公开官方 API 的存在，尚未取得这些网页功能实际请求的 Network 证据。不能把公开文档中的 API 名称、页面路由或搜索结果猜测成网页 Endpoint。

需要逐项确认：固定 URL Path、HTTP Method、脱敏字段名、状态码、脱敏响应结构，以及是否仅依赖浏览器 Cookie。

验收：每项能力都有真实请求证据后，才能进入 Cookie Adapter 实现。

### 任务 5：冻结认证和隐私方案

- 目标：确认请求凭据的归属和传输边界。
- 网页会话方案：仅由扩展向卖家精灵 Origin 发起 `credentials: include` 请求，Cookie 不离开浏览器。
- 官方 API 方案：API Key 必须由受控服务端托管，不能进入扩展、Web、KV 或 RemoteConfig；该方案需要单独设计用户身份、配额和审计。
- 验收：形成明确的凭据流向图，并证明 Worker 不接收卖家精灵 Cookie 或 API Key。

### 任务 6：冻结 Target Adapter 契约

- 候选 Target ID：`sellersprite`。
- 已登记候选 Operations：`CHECK_LOGIN`、`KEYWORD_REVERSE`、`COMPETITOR_RESEARCH`、`PRODUCT_SELECTION`、`MARKET_SELECTION`、`KEYWORD_PRODUCT_RESEARCH`、`KEYWORD_MINING`。
- 固定目标 Origin：`https://www.sellersprite.com`。
- 官方 API Endpoint 已记录在 `packages/sellersprite`：Reverse ASIN 使用 `POST /v1/traffic/keyword`，Keyword Mining 使用 `GET /v1/keyword/miner`。
- 这些 API 需要服务端托管的 `secret-key`，因此不能直接作为当前扩展的客户端 Target Endpoint。
- 固定响应解析：只返回经过 Schema 校验和脱敏的数据。
- 能力目录位置：`packages/sellersprite`，与通用 Target、Web SDK 和 Worker 解耦。
- 验收：Phase 9 可以按清单实现；在认证架构确定前不创建客户端 Adapter。

### 任务 7：建立独立能力模块并更新阶段文档

- 已新增 `packages/sellersprite` 独立领域包。
- 能力目录提供稳定标识、展示名、分类、固定 Origin 元数据和只读查询函数。
- 能力目录不包含真实 Endpoint，因此不会把未确认接口误标为已实现。
- 在本规格完成后，补齐接口证据和决策记录。
- 将已完成条目标记为完成。
- 将未确认项保留为阻塞项，不用假数据标记完成。
- Phase 8 验收通过后，再创建 Phase 9 Target Adapter 规格和实施代码。

## 4. 当前不执行的命令和代码变更

在接口契约确认前，不执行以下变更：

- 不替换 `apps/extension/src/targets/registry.ts` 中的 `example` Target。
- 不修改 `apps/extension/src/targets/policy.ts` 增加 `KEYWORD_REVERSE`。
- 不写卖家精灵私有 Endpoint。
- 不写 SellerSprite API Key。
- 不新增 Worker 代理路由。
- 不扩展 Manifest 到任意域名。

## 5. 验证清单

- [ ] 目标网站只能是 `https://www.sellersprite.com`。
- [ ] Web 页面不直接调用卖家精灵。
- [ ] 扩展请求经过 Registry、Permission、Policy 和固定 Endpoint 校验。
- [ ] RemoteConfig 只能启用或禁用已静态注册能力。
- [ ] 没有敏感凭据进入仓库、Web、Worker 或 RemoteConfig。
- [ ] 所有目标响应都经过严格结构校验。
- [ ] 用户未登录时不会进入关键词反查请求。

## 6. Phase 8 完成条件

Phase 8 完成后必须具备：

- 一份已确认的卖家精灵目标契约。
- 一份登录检测请求和响应样例（已脱敏）。
- 一份关键词反查请求和响应样例（已脱敏）。
- 一份认证、配额和隐私边界说明。
- 一份 Phase 9 Adapter 静态实现清单。

如果仍只有页面 URL、没有真实数据 API 契约，则 Phase 8 仍未完成。

## 7. 下一步

1. 确认登录检测方式：继续从当前已登录网页收集脱敏 Network 信息，或取得 SellerSprite 对网页会话接口的明确授权。
2. 若采用官方 API：单独设计服务端 API Key 托管、用户身份、配额和审计，不把该 API Key 放入扩展、Web、KV 或 RemoteConfig。
3. 在认证方案确定前，仅维护 `packages/sellersprite` 中的静态领域契约，不实现客户端 Adapter 或 Worker 通用代理。

不要发送真实 Cookie、Authorization、Session、secret-key 或其他凭据。