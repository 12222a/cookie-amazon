# Phase 2 RemoteConfig 实施计划

## 任务顺序

1. 创建 `packages/remote-config`，集中定义 RemoteConfig 类型、schema 校验、默认配置和缓存服务。
2. 为缓存服务实现 KV 读取、TTL、内存 LKG、错误分类和 Config Status。
3. 将 config-worker 的 KV binding 接入 `GET /api/extension/config`，保持静态资源 fallback 与 `/api/health`。
4. 增加 schema、缓存和 Worker 路由测试，更新 README 的 Phase 2 使用方式。
5. 运行 workspace typecheck、test、build，并执行 Worker 健康检查/配置路由 smoke test。

## 模块职责

- `packages/remote-config/src/schema.ts`：纯函数运行时校验，不访问网络和 KV。
- `packages/remote-config/src/cache.ts`：抽象 `ConfigStore`，实现 Worker 实例级缓存/LKG，不了解 HTTP。
- `cloudflare/config-worker/src/index.ts`：请求路由、HTTP 状态/headers、环境绑定，不实现 schema 细节。

## 数据约定

KV binding：`EXTENSION_CONFIG`

KV key：`extension:${CONFIG_ENVIRONMENT}:config`，默认 environment 为 `production`。

默认 TTL：30 分钟。TTL 和当前时间通过依赖注入传入，测试不依赖真实计时器。

## 安全约束

- 只接受固定配置路径和 GET 方法。
- 配置 schema 不接受 URL、Header、Cookie、Authorization 或可执行代码字段。
- Worker 不读取或转发 Target Cookie/Session/Authorization。
- Worker 错误响应不包含 KV 原文。
- 本阶段不实现签名验证；必须在 Phase 7 前补上生产信任链。

## 验收命令

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @cookie-amazon/config-worker dev
Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/health
```