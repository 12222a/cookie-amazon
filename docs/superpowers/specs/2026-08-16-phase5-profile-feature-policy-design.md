# Phase 5：Profile、Feature Flag、Kill Switch 与 Target Status

## 范围

Phase 5 在静态 Adapter、Host 权限和安全 TargetClient 之上增加：

- 本地注册的 `GET_PROFILE` Operation 与严格 Profile 响应校验
- RemoteConfig 驱动的 Target、Feature、Operation 降级开关
- Target Kill Switch（`target.enabled: false`）
- Profile Feature Flag（`target.features.profile: false`）
- Operation Kill Switch（`GET_PROFILE.enabled: false`）
- 聚合 Target Status：支持状态、有效启用状态、权限、可用能力
- Web SDK 与 Web 冒烟界面的 `getProfile(targetId)`

## RemoteConfig 安全模型

RemoteConfig 只与 Extension 本地静态能力取交集：

- 未注册 Target 永远忽略。
- 未注册 Operation 永远忽略。
- RemoteConfig 的 `enabled: true` 不能启用本地已关闭的 Target/Operation。
- Method 必须与本地 Operation Policy 一致。
- Endpoint 只能是安全相对 Path，解析后必须保持 Adapter Origin。
- RemoteConfig 不能修改 Web Origin、Config Origin、Target Origin、权限范围、Header、Cookie 或响应解析器。
- 配置不可用时使用 Extension 本地缓存的 LKG；没有 LKG 时回到静态能力，不动态增加能力。

## Profile 数据边界

Web 只接收：

```ts
{
  targetId: string
  profile: {
    userId: string
    displayName: string
  }
}
```

Adapter 不返回原始响应，也不返回 Cookie、Session、Authorization、CSRF、Token、Header 或任意额外字段。

## 调用顺序

```text
Target Registry
→ RemoteConfig 静态能力交集
→ Target/Feature/Operation Kill Switch
→ Host Permission
→ checkLogin
→ GET_PROFILE Operation Policy
→ TargetClient
→ Profile Response Validation
→ 最小 Profile DTO
```

## Target Status

`GET_TARGET_STATUS` 返回：

- `enabled`：静态 Adapter 与 RemoteConfig Target 开关的交集
- `granted`：当前 Host 权限
- `status`：`disabled` / `permission-required` / `ready`
- `capabilities`：当前有效且未被 Kill Switch 关闭的本地 Operation

本阶段不为了读取状态自动调用 Target API；登录状态仍通过显式 `CHECK_LOGIN` 获取。

## 非目标

- 订单能力
- 任意 Fetch、任意 URL、任意 Header
- RemoteConfig 签名、ETag、生产回滚（Phase 7）
- Cookie 读取、上传、记录或返回
- 真实业务网站适配

## 验收标准

- 未授权或未登录时不能获取 Profile。
- Target、Feature、Operation 任一关闭时请求在 HTTP Client 前失败。
- 未知 Target/Operation 不会被 RemoteConfig 创建。
- Profile 响应非法时返回 `TARGET_RESPONSE_INVALID`。
- 原始响应中的 Cookie/Token/额外字段不会进入协议响应。
- Target Status 正确反映有效开关、权限和能力。
- `pnpm typecheck`、`pnpm test`、`pnpm build` 全部通过。