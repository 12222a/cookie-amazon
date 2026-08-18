# Phase 9 SellerSprite 网页会话 Adapter 实施计划

## 1. 当前状态

- 阶段：Phase 9
- 状态：核心能力已实现，待 Chrome 手动冒烟
- 当前优先级：JSON 业务能力（关键词反查、查竞品、产品选择、关键词挖掘）与 HTML 安全边界会话均已桥接并测试；剩余仅 Chrome 手动冒烟。

## 2. 实施顺序

### 任务 1：保存网页契约证据

- 将 Playwright 抓取结果脱敏后写入独立 Markdown。
- 只保存 pathname、method、字段名、状态码、键结构和认证字段存在性。
- 禁止保存参数值、完整响应或凭据。

验收：文档可支持静态 Adapter 实现，且不包含用户会话信息。

### 任务 2：冻结领域契约

- 将 `SELLERSPRITE_WEB_CAPABILITY_CONTRACTS` 更新为 confirmed。
- 为每项能力记录固定 Endpoint、Method 和 JSON/HTML response kind。
- 保持官方 `api.sellersprite.com` secret-key 契约与网页登录契约分离。

验收：客户端代码中不存在 `secret-key`，所有 Web Endpoint 均来自真实证据。

### 任务 3：实现登录探测 Adapter

- 为通用 Adapter factory 增加受控的行为注入点。
- 增加 `html-login-probe` parser。
- 注册 SellerSprite Adapter。
- 固定 `GET /v2/me`、`credentials: include`。
- 禁用 SellerSprite Profile。

验收：Web SDK 现有 `checkLogin('sellersprite')` 链路可以返回最小布尔结果，HTML 不被读取。

### 任务 4：接入权限与 Manifest

- 增加 `https://www.sellersprite.com/*` optional host permission。
- Permission Manager 继续只允许静态 Registry 中的目标。
- 不增加任意域名权限。

验收：未授权时 Background 返回 `TARGET_PERMISSION_MISSING`，授权后才能探测。

### 任务 5：实现 JSON Session Commands

按以下顺序逐项实现：

1. `KEYWORD_REVERSE`
2. `KEYWORD_MINING`
3. `COMPETITOR_RESEARCH`
4. `PRODUCT_SELECTION`

每项必须具备：

- Protocol 输入 Schema。
- Query/Body 字段 allowlist。
- 参数类型、长度、分页上限。
- 固定 Path/Method。
- 最小响应 Schema。
- 401/403/429/5xx、超时和非法 JSON 测试。

禁止提供 `{ url, headers, body }` 形式的通用调用接口。

### 任务 6：设计 HTML 能力安全提取

- `MARKET_SELECTION`
- `KEYWORD_PRODUCT_RESEARCH`

在稳定结构化 Schema 冻结前保持不桥接。禁止返回原始 HTML。

### 任务 7：验证

最小命令：

```text
pnpm --filter @cookie-amazon/sellersprite typecheck
pnpm --filter @cookie-amazon/sellersprite test
pnpm --filter @cookie-amazon/extension typecheck
pnpm --filter @cookie-amazon/extension test
```

完成后执行：

```text
pnpm typecheck
pnpm test
pnpm build
```

不使用真实 SellerSprite 会话执行自动测试；全部网络测试使用 mock fetch。

## 3. 当前切片完成标准

- [x] 契约证据文档已创建。
- [x] Phase 9 规格与计划已创建。
- [x] SellerSprite Web Endpoint 静态契约已冻结。
- [x] SellerSprite Adapter 与 Registry 已接入。
- [x] 登录探测与 HTML 安全边界已实现。
- [x] optional host permission 已接入。
- [x] JSON 业务能力 bridge（KEYWORD_REVERSE、COMPETITOR_RESEARCH、PRODUCT_SELECTION、KEYWORD_MINING）。
- [x] HTML 业务安全提取（MARKET_SELECTION、KEYWORD_PRODUCT_RESEARCH 只返回最小完成状态，不返回 HTML）。
- [ ] Chrome 手动冒烟。

## 4. 不在当前切片完成的事项

- 不接入官方 API `secret-key`。
- 不增加 Worker 代理。
- 不读取 Cookie。
- 不返回个人中心 HTML。
- 不在 Schema 未冻结时向 Web 暴露完整产品对象。
- 不猜测未登录跳转 pathname。