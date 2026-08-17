# Phase 4 实施计划：Target HTTP Client

## 1. 协议扩展

- 增加 `CHECK_LOGIN` Target action。
- 增加登录状态响应类型和 HTTP/操作错误码。
- 严格校验 action 对应的响应数据。

## 2. Adapter 与 Endpoint Registry

- 扩展 Adapter 定义，要求提供操作策略和 `checkLogin` 实现。
- 新增本地 `policy.ts`，以字面量 Operation Allowlist 和安全 Path 校验承载 Endpoint Registry。
- `createTargetAdapter` 为示例目标提供固定 `/api/me` GET 策略。

## 3. Target HTTP Client

- 新增 `TargetClient`，根据 Adapter Origin 与 Endpoint Path 构造 URL。
- 使用 `credentials: include`，AbortController 实现超时。
- 只解析登录布尔状态，不传播原始响应。
- 统一映射网络、超时、429、HTTP 错误和响应校验错误。

## 4. 消息链路

- Background 在权限和静态 Registry 检查后调用 Adapter `checkLogin`。
- Content Script 复用 Target action relay。
- Web SDK 增加 `checkLogin(targetId)`，保持 targetId-only API。

## 5. 验证

- 添加协议、Policy、TargetClient 测试，覆盖未知操作、Endpoint 越界、401/429、响应校验和超时。
- 运行 `pnpm typecheck`、`pnpm test`、`pnpm build`。
- Chrome 手测：重新加载扩展、授权 `example.com` 后从 Web 调用登录检查；当前示例站点不是实际业务 API，预期只验证链路和明确错误映射。