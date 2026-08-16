# Phase 3 Target Adapter 与权限设计规格

## 目标

建立扩展侧的本地可信 Target 能力边界：

```text
TargetId → TargetRegistry → Trusted Adapter → PermissionManager → Target Status
```

本阶段让用户可以针对已知 Target 检测、申请和取消 Host 权限，但不发起目标站请求。

## 范围

- `TargetAdapter` 只读描述接口
- 本地静态 `TargetRegistry` 白名单
- `TargetExampleAdapter` 示例适配器
- `TargetPermissionManager`：contains/request/remove
- `optional_host_permissions`
- Target 状态：`unknown`、`disabled`、`permission-required`、`ready`
- Web SDK/Extension 协议的 targetId-only 管理接口

## 非目标

- Target HTTP Client、Endpoint Registry、Operation Policy（Phase 4）
- `checkLogin`、`getProfile` 和真实 Target API
- Cookie/Session 读取或上传
- 任意 URL、Origin、Header、Body、Fetch
- RemoteConfig 签名和回滚（Phase 7）

## 静态信任边界

Registry 中的 Adapter 由扩展代码静态注册，RemoteConfig 只能修改已存在 Target 的启用状态，不能新增 Adapter、Origin 或权限模式。Web 消息只能携带 `targetId`，不能携带目标 URL/origin。

Example Adapter 使用 `https://example.com` 作为非业务示例，仅定义 origin 和权限模式，不实现网络调用。

## 权限生命周期

```text
list/get status
  ↓
permission-required
  ↓ 用户明确点击授权
permissions.request({ origins })
  ↓
ready
  ↓ 用户明确点击取消
permissions.remove({ origins })
  ↓
permission-required
```

所有权限操作必须通过 TargetId 查找本地 Adapter；未知或禁用 Target 不得触发浏览器权限 API。取消授权后下一次状态检查必须立即反映权限缺失。

## 协议

支持：`LIST_TARGETS`、`GET_TARGET_STATUS`、`REQUEST_TARGET_PERMISSION`、`REMOVE_TARGET_PERMISSION`。除 `LIST_TARGETS` 外均只接收 `{ targetId: string }`。响应不包含 Cookie、Session、Authorization 或任意 URL 输入；origin 仅可作为本地可信 Adapter 的只读描述返回。

## 验收标准

- 未知 targetId 不会触发权限 API。
- Registry 不能被 RemoteConfig 未知 Target 动态扩展。
- request/remove/contains 均映射到正确的权限模式。
- 权限取消后状态变为 `permission-required`。
- Manifest 不增加默认目标站 host 权限，仅增加 optional host permissions。
- `pnpm typecheck`、`pnpm test`、`pnpm build` 通过。
- 不实现任何真实 Target HTTP 请求。