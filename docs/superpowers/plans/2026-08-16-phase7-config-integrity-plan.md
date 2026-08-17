# Phase 7 实施计划：RemoteConfig ETag 条件请求

## 1. Worker ETag

- 基于已校验的 `configVersion` 生成稳定、带引号的 ETag。
- `/api/extension/config` 对匹配的 `If-None-Match` 返回 304。
- 所有配置响应继续使用 `no-store`，避免把安全配置交给不可控中间缓存。

## 2. Extension 缓存协商

- LKG 存储增加可选 ETag。
- 请求携带本地 ETag；304 时刷新 fetchedAt 并返回已校验配置。
- 对旧格式存储兼容：没有 ETag 时正常发送普通 GET。
- 304 无本地配置时不启用任何远程能力。

## 3. 测试与验证

- Worker 测试 ETag、304、配置体缺失。
- Extension 测试请求头、304 命中和无 LKG 回退。
- 运行 `pnpm typecheck`、`pnpm test`、`pnpm build`。
- 检查构建 Manifest，不扩大 Target 权限。

## 4. 后续切片

- Web Crypto 签名验证和密钥轮换策略。
- `/api/extension/version`、状态和受控回滚元数据。
- 脱敏安全事件日志。
- Chrome/Edge 构建配置与生产部署检查。