# Phase 2 RemoteConfig 设计规格

## 目标

在不接入真实 Target API、Target Adapter 或权限管理的前提下，为扩展提供一个安全、可缓存、可回退的 RemoteConfig 读取链路：

```text
Cloudflare Worker → Workers KV → RemoteConfig Schema → Extension Config Consumer
```

本阶段只提供配置读取基础设施，不把配置直接变成可执行能力。

## 范围

- Workers KV binding：`EXTENSION_CONFIG`
- `GET /api/extension/config`
- `RemoteConfig` schema version 1 及运行时校验
- 环境配置键：`extension:<environment>:config`
- Worker 内存缓存、TTL、Last Known Good（LKG）回退
- `Config Status`：`fresh`、`stale`、`last-known-good`、`unavailable`、`invalid`
- 无敏感请求头转发；配置响应禁止携带 Cookie、Session、Authorization

## 非目标

- RemoteConfig 签名、ETag、生产回滚（Phase 7）
- TargetRegistry、Adapter、Host 权限（Phase 3）
- Target HTTP Client、业务操作（Phase 4+）
- Worker 代理 Target API
- 动态下载或执行 JavaScript/WASM

## Schema

```ts
interface RemoteConfig {
  schemaVersion: 1
  configVersion: number
  minimumExtensionVersion: string
  features: Record<string, boolean>
  targets: Record<string, {
    enabled: boolean
    features: Record<string, boolean>
    operations: Record<string, {
      enabled: boolean
      path: `/${string}`
      method: 'GET' | 'POST'
      timeoutMs: number
    }>
  }>
}
```

Phase 2 允许 `features`、target ID、feature 名称和 operation 名称作为数据存在，但不会由 Worker 或扩展动态创建 Adapter。URL 只允许绝对路径，不能出现 scheme、host、协议相对 URL、控制字符或 `..` 路径段。请求方法和 timeout 是受限枚举/范围，而非任意请求策略。

## 缓存与 LKG

- 默认 TTL 为 30 分钟，Worker 常量 `REMOTE_CONFIG_TTL_MS` 可被测试注入。
- KV 成功读取并通过校验的配置成为当前值和 LKG。
- TTL 内请求返回内存缓存，状态为 `fresh`。
- TTL 过期后重新读取 KV；KV 暂时不可用时返回过期的 LKG，状态为 `last-known-good`，并通过 `stale: true` 明确告知调用方。
- KV 返回空值、JSON 损坏或 schema 无效时不得激活该配置；若存在 LKG 则回退，否则返回 503。
- LKG 为 Worker 实例内存状态，不宣称跨实例持久化一致性；Workers KV 的最终一致性由调用方容忍短时旧配置。

## HTTP 响应

成功响应：

```json
{
  "ok": true,
  "status": "fresh",
  "stale": false,
  "config": { "schemaVersion": 1, "configVersion": 1, "...": "..." }
}
```

失败响应只返回稳定错误码，不返回 KV 原文或敏感内容：`CONFIG_UNAVAILABLE`、`CONFIG_INVALID`。所有响应使用 `Cache-Control: no-store`，避免浏览器或中间层绕过 Worker TTL。

## 验收标准

- 合法配置可被 KV 读取并返回。
- 缓存命中不重复读取 KV；TTL 到期会重新读取。
- KV 故障/空值/无效配置触发 LKG 或安全失败。
- 非 GET、未知路径和错误输入不泄露配置原文。
- 单元测试覆盖 schema、path 安全约束、缓存、TTL、LKG、状态和错误响应。
- `pnpm typecheck`、`pnpm test`、`pnpm build` 通过。