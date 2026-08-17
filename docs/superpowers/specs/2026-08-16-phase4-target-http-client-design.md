# Phase 4：Target HTTP Client 与安全操作执行

## 范围

本阶段在 Phase 3 的静态 Target Registry 和运行时 Host 权限之上，增加最小的只读 Target API 执行闭环：

- 本地静态 Operation Allowlist（当前仅 `CHECK_LOGIN`）
- 每个 Adapter 的 Endpoint Registry（Path、Method、Timeout、响应类型）
- `TargetClient` 直接向已授权 Target Origin 发起请求
- `credentials: include` 由浏览器管理目标站 Session；不读取、不返回、不记录 Cookie
- 超时、网络错误、429、非成功响应和响应结构校验
- Adapter 自己暴露 `checkLogin()`，Background 仅通过静态 Registry 选择 Adapter
- Web SDK 暴露 `checkLogin(targetId)`，仍不接受 URL、Origin、Header、Cookie 或任意请求

## 不在范围内

- 真实业务网站 API、订单、Profile
- Cookie 或 Authorization 读取/上传
- 任意 URL、任意 Method、任意 Header、万能 Fetch
- RemoteConfig 创建 Adapter 或 Operation
- Feature Flag、Kill Switch、签名配置（Phase 5/7）

## 安全决策

1. `TargetClient` 只能接收 Registry 中的 Adapter；Endpoint 必须是相对 Path，解析后必须保持 Adapter Origin。
2. Operation 名称为本地字面量 Allowlist。未知 Operation 和禁用 Operation 均拒绝。
3. 请求仅设置固定的 Method、`credentials: include` 和 AbortSignal，不把 Cookie 作为数据接触。
4. 响应只转换为 `{ targetId, loggedIn }`，不把原始响应传给 Web 页面。
5. 429、超时、网络失败和结构异常映射为稳定协议错误码，日志层不接触敏感数据。

## 验收标准

- 未知 Target、未授权 Target、禁用 Target 不会进入 HTTP Client。
- `CHECK_LOGIN` 请求只能命中 Adapter Origin 下的静态 `/api/me`。
- 路径穿越、绝对 URL、非法 Method/Timeout、未知 Operation 被拒绝。
- 401 返回 `loggedIn: false`；有效响应只接受布尔 `loggedIn` 或 `authenticated`。
- 429、超时、网络失败、非 JSON/错误 JSON 返回明确错误。
- 协议、Client、Background/Web SDK 单元测试通过，`pnpm typecheck && pnpm test && pnpm build` 通过。