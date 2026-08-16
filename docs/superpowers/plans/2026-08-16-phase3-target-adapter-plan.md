# Phase 3 Target Adapter 与权限实施计划

## 任务顺序

1. 创建扩展侧 `TargetAdapter`、静态 `TargetRegistry`、Example Adapter 和权限模式校验。
2. 创建可注入 `TargetPermissionManager`，实现 contains/request/remove 与 Target 状态解析。
3. 扩展 protocol action/response 校验，Background 处理 target 管理请求，Content Script 安全转发。
4. Web SDK 暴露 target 管理方法，统一 origin、超时和错误映射；manifest 增加 optional host permissions。
5. 增加模块、协议和 Worker API 测试，运行完整 workspace 验证。

## 模块职责

- `apps/extension/src/targets/adapter.ts`：Adapter 描述契约与可信 origin/permission pattern 校验。
- `apps/extension/src/targets/registry.ts`：静态白名单和启用状态，不访问浏览器 API。
- `apps/extension/src/targets/permissions.ts`：浏览器权限 API 适配与状态计算，通过依赖注入测试。
- `packages/protocol`：跨边界消息和响应的运行时校验。
- `packages/web-sdk`：只构造 targetId-only 请求，不暴露任意网络能力。

## 安全约束

- 只允许 `https` 的固定 origin 和精确 host pattern。
- `targetId` 只能匹配本地 Registry；RemoteConfig 未知 ID 不注册。
- `permissions.request` 仅由显式 SDK 调用触发，不在页面加载或 PING 时自动触发。
- Phase 3 不读取 Cookie，不调用 fetch，不向 Worker/网页发送 Session。

## 验收命令

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Chrome 手工验证只检查 manifest 的 `optional_host_permissions` 和权限 request/remove 生命周期；真实 Target API 测试留到 Phase 4。