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
5. 点击“检测扩展”，应显示连接状态、协议版本 `1`、扩展版本和 `PING` 能力。

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

Phase 3 Target 管理接口仅接受 `targetId`，不接受 Web 传入的 URL、Origin、Header、Cookie 或任意 Request。当前内置 `example` Adapter（`https://example.com`）仅用于权限生命周期演示，不会发起 Target API 请求。扩展使用 `optional_host_permissions`，只有显式调用 `requestTargetPermission(targetId)` 才会请求 Host 权限；`removeTargetPermission(targetId)` 后状态立即回到 `permission-required`。

Phase 3 仍不实现真实 Target API、Cookie/Session、订单、任意 Fetch、Target HTTP Client 或业务操作。