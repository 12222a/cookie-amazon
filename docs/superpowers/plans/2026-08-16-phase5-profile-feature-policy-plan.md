# Phase 5 实施计划：Profile 与运行时能力策略

## 1. 配置消费与 LKG

- 在 Extension 中新增 `RemoteConfigManager`。
- 固定从本地 `REMOTE_CONFIG_ORIGIN` 获取配置，不携带凭据。
- 使用 `browser.storage.local` 缓存最后有效配置和抓取时间。
- 配置失败时使用 LKG；没有 LKG 时使用静态能力。

## 2. 静态能力交集

- 新增纯函数运行时策略模块。
- 将 RemoteConfig Target、Feature、Operation 开关与本地 Adapter Policy 取交集。
- 忽略未知 Target/Operation，拒绝 Method 扩张和不安全 Endpoint。

## 3. Profile Operation

- 本地注册 `GET_PROFILE` 与固定响应解析器。
- Adapter 增加 `getProfile()`。
- TargetClient 增加 Profile 执行和最小 DTO 映射。
- Profile 调用前执行权限、Feature、Operation 与登录检查。

## 4. 协议和界面

- 协议新增 `GET_PROFILE`、Profile DTO、Feature 错误码与增强 Target Status。
- Background、Content Script 和 Web SDK 接入。
- Web 冒烟界面显示能力并增加“读取资料”。

## 5. 测试与验证

- 测试 RemoteConfig LKG、安全交集、未知 Adapter/Operation、Kill Switch、Feature Flag。
- 测试未登录、非法 Profile 响应、敏感字段不暴露。
- 运行 `pnpm typecheck`、`pnpm test`、`pnpm build`。
- Chrome 手测 Target 授权、登录检查、Profile 错误/成功映射与取消授权。