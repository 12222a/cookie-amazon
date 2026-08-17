# Cookie Amazon Platform — Phase 3

Phase 1 打通 Web UI → Web SDK → `webext-bridge` window/content-script/background → WXT MV3 Extension → PING 状态返回。Phase 2 增加 Workers KV RemoteConfig 读取、TTL 和 LKG。Phase 3 增加本地 TargetAdapter 白名单和运行时 Host 权限管理。

## 安装

```powershell
cd "f:\github project\cookie-amazon\cookie-amazon-platform"
pnpm install
```

## 本地开发

分别打开三个终端：

```powershell
pnpm dev:web
pnpm dev:extension
pnpm dev:worker
```

- Web UI：http://localhost:5173
- Wrangler Worker：http://localhost:8787
- Chrome 扩展构建目录：`apps/extension/.output/chrome-mv3`

## Chrome 手工验证

1. 执行 `pnpm --filter @cookie-amazon/extension build`。
2. 打开 `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择 `apps/extension/.output/chrome-mv3`。
4. 启动 Web UI，打开 http://localhost:5173。
5. 点击“检测扩展”，应显示连接状态、协议版本 `1`、扩展版本以及 `PING`、`CHECK_LOGIN` 能力。
6. `example` 初始应显示 `permission-required`；点击“授权访问”并在 Chrome 提示中允许 `example.com`。
7. 授权后状态应变为 `ready`；点击“检查登录”，应显示登录状态或明确的 `TARGET_API_ERROR` / `TARGET_RESPONSE_INVALID`。示例站点不保证存在 `/api/me`，因此明确错误属于预期结果。
8. 点击“取消授权”，状态应立即回到 `permission-required`，且“检查登录”按钮不可用。
9. 拒绝权限提示时，应显示 `PERMISSION_REQUEST_DENIED`，Target 不得进入 HTTP Client。

## 验证命令

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Worker 健康检查：

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/health
```

Phase 2 配置接口：

```text
GET http://localhost:8787/api/extension/config
```

Worker 从 `EXTENSION_CONFIG` Workers KV 的 `extension:production:config` 读取配置，默认 TTL 为 30 分钟。Wrangler 本地开发使用本地 KV 模拟；部署前需要将 `wrangler.jsonc` 中的 KV namespace `id` 替换为真实 namespace，并按环境设置 `CONFIG_ENVIRONMENT`。配置读取失败时仅在当前 Worker 实例内使用 Last Known Good（LKG），没有有效配置则返回 503。

Phase 3 Target 管理接口仅接受 `targetId`，不接受 Web 传入的 URL、Origin、Header、Cookie 或任意 Request。当前内置 `example` Adapter（`https://example.com`）用于权限生命周期和 Phase 4 登录检查演示。扩展使用 `optional_host_permissions`，只有显式调用 `requestTargetPermission(targetId)` 才会请求 Host 权限；`removeTargetPermission(targetId)` 后状态立即回到 `permission-required`。

Phase 4 增加 `TargetClient` 和本地 Operation/Endpoint Registry。当前只开放 `CHECK_LOGIN`：固定调用 Adapter Origin 下的 `GET /api/me`，使用浏览器 `credentials: include` 管理目标站 Session，并只返回 `{ targetId, loggedIn }`。未知 Operation、绝对 URL、越界 Path、未授权/禁用 Target、429、超时、网络错误和非法响应都会被拒绝或映射为明确错误。当前示例站点不保证存在该 API，因此 Chrome 手测重点验证授权、请求边界和错误链路。

Phase 4 仍不实现真实 Target API、Cookie/Session 读取或传输、订单、Profile、任意 Fetch、Target HTTP Proxy 或业务操作。