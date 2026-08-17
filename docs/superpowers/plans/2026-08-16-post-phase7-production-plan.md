# Phase 7 之后生产化开发计划

## 1. 文档目的

本文档用于规划 Phase 7 完成后的下一阶段工作，将当前演示平台逐步推进为：

- 一个可访问的正式 Web 网站
- 一个同时提供 Web 静态资源和 RemoteConfig API 的 Cloudflare Worker
- 一个接入真实目标网站的 Chrome 扩展
- 一套可验证的生产端到端链路

当前仓库已经完成 Phase 1–5，并在 Phase 5 中提前完成 Phase 6 的主要能力。Phase 7 已完成 RemoteConfig ETag 条件请求、`304 Not Modified`、扩展端 ETag 缓存和 Last Known Good 回退能力。

## 2. 当前部署关系

当前 `cloudflare/config-worker/wrangler.jsonc` 已配置：

```jsonc
{
  "assets": { "directory": "../../apps/web/dist", "binding": "ASSETS" }
}
```

因此，Worker 部署后可以同时提供：

| 类型 | 路径 | 说明 |
|---|---|---|
| Web 网站 | `/` 及静态资源路径 | 返回 `apps/web/dist` 中的构建产物 |
| Worker 健康检查 | `/api/health` | 检查 Config Worker 是否可用 |
| RemoteConfig API | `/api/extension/config` | 从 KV 读取并返回扩展配置 |

但 Worker 部署不会自动生成正式网站。必须先完成 `apps/web` 的产品页面开发，并在部署前生成 `apps/web/dist`。当前 Worker 的正确定位是“Web 静态资源托管 + 扩展配置 API”，不是目标网站代理。

## 3. 总体执行顺序

| 顺序 | 阶段 | 目标 | 状态 | 主要产出 |
|---:|---|---|---|---|
| 1 | Phase 8 | 确定真实产品和第一个目标网站 | 进行中 | 产品流程、目标接口、权限边界 |
| 2 | Phase 9 | 接入真实 Target Adapter | 待开始 | 真实目标 Registry、Adapter、Policy、测试 |
| 3 | Phase 10 | 将 `apps/web` 改造成正式网站 | 待开始 | 首页、扩展检测、授权、状态和 Profile 页面 |
| 4 | Phase 11 | 确定生产域名和 Origin | 待开始 | 正式 Web Origin、Worker Origin、扩展配置 |
| 5 | Phase 12 | 部署 Cloudflare Worker | 待开始 | Web 网站和 RemoteConfig API 上线 |
| 6 | Phase 13 | 配置生产 RemoteConfig | 待开始 | 生产 KV 配置、ETag、回退验证 |
| 7 | Phase 14 | 构建生产扩展 | 待开始 | 正式 Chrome MV3 构建包 |
| 8 | Phase 15 | 完成真实端到端测试 | 待开始 | 正常流程、异常流程和安全验收记录 |

依赖关系：

```text
Phase 8 真实目标确认
    ↓
Phase 9 真实 Adapter
    ↓
Phase 10 正式 Web 网站
    ↓
Phase 11 生产域名与 Origin
    ↓
Phase 12 Worker 部署
    ↓
Phase 13 RemoteConfig 配置
    ↓
Phase 14 生产扩展
    ↓
Phase 15 端到端测试
```

## 4. 分阶段计划

### Phase 8：确定真实产品目标和目标网站

#### 目标

在编码前确定第一个真实业务场景和目标网站，避免把系统扩展成任意网站代理。

#### 工作项

- [ ] 明确产品名称、用途和目标用户。
- [x] 明确用户从 Web 网站进入后的完整流程。
- [x] 选定第一个真实目标网站：卖家精灵（`https://www.sellersprite.com`）。
- [ ] 确认目标网站是否允许相关自动化访问。
- [ ] 确认登录状态检查接口。
- [ ] 确认关键词反查接口和权限。
- [ ] 记录接口的 Origin、Method、固定 Path 和请求参数。
- [ ] 记录成功响应、401、403、429、5xx、超时和非法 JSON 行为。
- [ ] 确认只使用用户浏览器向目标网站发送会话请求，或完成官方 API 的服务端方案设计。
- [x] 确认 Cookie、Session、Authorization 不上传到自有服务器。

#### 验收标准

- 已确定一个真实目标网站。
- 已确认真实接口和响应结构。
- 已确认目标网站权限边界。
- 没有使用任意 URL、万能代理或动态目标配置方案。

### Phase 9：接入真实 Target Adapter

#### 目标

用一个真实目标替换当前演示 Target，并保持 Registry、Permission、Policy、Endpoint 四层安全校验。

#### 工作项

- [ ] 修改 `apps/extension/src/targets/registry.ts`。
- [ ] 新增真实目标 Adapter。
- [ ] 固定 Target ID、Origin、Host 权限和 Endpoint。
- [ ] 在 `policy.ts` 中静态注册允许的 Operation。
- [ ] 在 `policy.ts` 中静态注册固定 HTTP Method 和 Path。
- [ ] 实现 `CHECK_LOGIN`。
- [ ] 实现 `GET_PROFILE`。
- [ ] 对目标响应进行严格 Schema 校验。
- [ ] 对 Profile 数据进行脱敏后再返回 Web。
- [ ] 添加 401、403、429、5xx、超时和非法 JSON 错误映射。
- [ ] 禁止 Adapter 使用动态 URL。
- [ ] 禁止 RemoteConfig 创建新的 Adapter、Operation 或 Endpoint。

#### 测试和验收

- [ ] 成功登录状态检查。
- [ ] 未登录状态检查。
- [ ] 成功获取 Profile。
- [ ] 目标网站返回 401。
- [ ] 目标网站返回 403。
- [ ] 目标网站返回 429。
- [ ] 目标网站返回 5xx。
- [ ] 目标网站请求超时。
- [ ] 目标网站返回非法 JSON。
- [ ] Profile 缺少必要字段时拒绝响应。
- [ ] 未授权 Target 请求被拒绝。
- [ ] 未注册 Target 请求被拒绝。
- [ ] 未知 Operation 请求被拒绝。

### Phase 10：将 `apps/web` 改造成正式网站

#### 目标

把当前验证用 UI 改造成用户可以完成完整操作的正式 Web 页面。

#### 页面和功能

- [ ] 首页：产品用途、扩展作用、隐私边界和开始使用入口。
- [ ] 扩展检测：检测安装状态、调用 `PING`、展示版本和重试入口。
- [ ] 目标选择：只展示本地支持的目标，不允许输入任意网站地址。
- [ ] 权限授权：展示目标 Host 权限、请求权限、拒绝权限和移除权限。
- [ ] 登录状态：调用 `CHECK_LOGIN`，展示已登录、未登录和检查失败状态。
- [ ] Profile 页面：调用 `GET_PROFILE`，展示经过校验和脱敏的数据。
- [ ] 错误状态：覆盖扩展未安装、Worker 不可用、Target 未授权和目标网站异常。
- [ ] 加载状态：统一处理加载中、成功、空数据、失败和重试。
- [ ] 生产 Origin：只允许正式 Web Origin 调用 Web SDK。

#### 强制边界

- [ ] Web 页面只调用 Web SDK。
- [ ] Web 页面不直接请求目标网站。
- [ ] Web 页面不读取 Cookie、Session 或 Authorization。
- [ ] UI 隐藏不能代替 Background 的协议、权限和 Policy 校验。

#### 验收标准

用户可以从首页开始，完成扩展检测、目标选择、权限授权、登录状态检查和 Profile 展示的完整流程。

### Phase 11：确定生产域名和 Origin

#### 目标

确定正式域名，并同步更新 Web、扩展和 Worker 的通信边界。

#### 工作项

- [ ] 确定正式 Web 域名，例如 `https://app.example.com`。
- [ ] 确定 Config Worker 域名，例如 `https://config.example.com`。
- [ ] 更新 Web SDK 允许的 Origin。
- [ ] 更新 Extension Background 的 Origin 校验。
- [ ] 更新 RemoteConfig Worker 地址。
- [ ] 更新 WXT 生产配置。
- [ ] 更新 Manifest 所需权限。
- [ ] 确认本地环境和生产环境配置分离。
- [ ] 确认未授权 Origin 会被拒绝。

#### 验收标准

- 生产 Web Origin 可以正常调用扩展。
- 扩展只接受明确允许的 Web Origin。
- Config Worker 地址不再依赖本地服务。
- Manifest 没有增加不必要的目标网站权限。

### Phase 12：部署 Cloudflare Worker

#### 目标

部署同时提供 Web 静态资源和 RemoteConfig API 的生产 Worker。

#### 部署前检查

- [ ] 创建或确认生产 Worker。
- [ ] 创建或确认生产 KV Namespace。
- [ ] 确认 `EXTENSION_CONFIG` 绑定到生产 KV。
- [ ] 确认生产环境变量。
- [ ] 确认 `apps/web/dist` 将在部署前生成。
- [ ] 确认 KV 和环境变量中没有敏感凭据。
- [ ] 确认 Worker 不代理目标网站请求。

#### 推荐部署顺序

```bash
pnpm --filter @cookie-amazon/web build
pnpm --filter @cookie-amazon/config-worker typecheck
pnpm --filter @cookie-amazon/config-worker test
pnpm --filter @cookie-amazon/config-worker deploy
```

#### API 验证

- [ ] `GET /api/health` 返回成功。
- [ ] `GET /api/extension/config` 返回有效 RemoteConfig。
- [ ] 响应包含 ETag。
- [ ] 携带 `If-None-Match` 返回 `304 Not Modified`。
- [ ] 非 GET 请求返回 `405`。
- [ ] 携带 Cookie、Authorization 或 CSRF Header 的配置请求被拒绝。
- [ ] Worker 找不到有效 KV 配置时返回预期错误。
- [ ] Worker 不接收目标网站 Cookie。

#### Web 验证

- [ ] 根路径可以打开 Web 网站。
- [ ] 静态 JS、CSS 和图片正常加载。
- [ ] 页面刷新不会出现静态资源错误。
- [ ] Web 页面可以检测扩展。
- [ ] Web 页面可以调用 `PING`。

### Phase 13：配置生产 RemoteConfig

#### 目标

通过 KV 控制已存在能力的启用状态，但不能扩大本地安全边界。

#### RemoteConfig 允许内容

- [ ] 配置版本。
- [ ] 环境名称。
- [ ] Feature 开关。
- [ ] 已注册 Target 的启用状态。
- [ ] 已注册 Operation 的启用状态。
- [ ] 最小配置版本。
- [ ] 配置过期时间。
- [ ] 非敏感展示信息。

#### RemoteConfig 禁止内容

- [ ] Cookie、Session、Authorization 或密码。
- [ ] 任意目标 URL。
- [ ] 任意 HTTP Method。
- [ ] 新 Adapter 定义。
- [ ] 新 Operation 定义。
- [ ] Manifest 权限。
- [ ] 服务器凭据。

#### 验收标准

- [ ] Feature 启用和禁用生效。
- [ ] Operation 启用和禁用生效。
- [ ] RemoteConfig 禁止未注册 Operation。
- [ ] RemoteConfig 不能扩大 Target 权限。
- [ ] ETag 命中时扩展可以使用缓存。
- [ ] Worker 不可用时扩展可以使用 LKG。
- [ ] 无效配置不会被扩展接受。

### Phase 14：配置并构建生产扩展

#### 目标

让 Chrome 扩展连接正式 Web 网站和正式 Config Worker。

#### 工作项

- [ ] 修改 `apps/extension/src/remote-config.ts` 中的 Worker 地址。
- [ ] 修改 `apps/extension/wxt.config.ts` 的生产配置。
- [ ] 更新生产 Web Origin。
- [ ] 更新扩展版本号。
- [ ] 检查 Content Script 注入范围。
- [ ] 检查 `permissions`。
- [ ] 检查 `optional_host_permissions`。
- [ ] 检查 `host_permissions`。
- [ ] 确认没有 `*://*/*`。
- [ ] 生成 Chrome MV3 构建包。

#### 构建验证

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

重点检查：

```text
apps/extension/.output/chrome-mv3/manifest.json
```

### Phase 15：真实端到端测试

#### 正常流程

- [ ] 用户访问生产 Web 网站。
- [ ] Web 网站检测扩展。
- [ ] 扩展返回 `PING`。
- [ ] 用户选择真实目标网站。
- [ ] 用户授权目标网站权限。
- [ ] 执行 `CHECK_LOGIN`。
- [ ] 执行 `GET_PROFILE`。
- [ ] 页面展示脱敏后的 Profile。
- [ ] 用户移除目标权限。
- [ ] 移除权限后请求被拒绝。

#### 异常流程

- [ ] 扩展未安装。
- [ ] 扩展未运行。
- [ ] 扩展版本不兼容。
- [ ] Web Origin 不合法。
- [ ] 协议版本不匹配。
- [ ] Target 未注册。
- [ ] Target 未授权。
- [ ] Operation 未知。
- [ ] Operation 被 RemoteConfig 禁用。
- [ ] Feature 被 RemoteConfig 禁用。
- [ ] Config Worker 超时。
- [ ] Config Worker 返回 500。
- [ ] Config Worker 返回无效配置。
- [ ] Config Worker 返回 304。
- [ ] 使用 LKG 配置。
- [ ] 目标网站返回 401、403、429、5xx。
- [ ] 目标网站响应超时。
- [ ] 目标网站返回非法 JSON。

#### 最终安全验收

- [ ] Cookie、Session、Authorization 不进入 Web 服务。
- [ ] Cookie、Session、Authorization 不进入 Config Worker。
- [ ] Web 页面不直接访问目标网站。
- [ ] Worker 不代理目标网站。
- [ ] RemoteConfig 不能创建新 Adapter。
- [ ] RemoteConfig 不能创建新 Operation。
- [ ] RemoteConfig 不能扩大 Manifest 权限。
- [ ] Target 请求必须同时通过 Registry、Permission、Policy 和 Endpoint 校验。
- [ ] 所有错误都能转换为有限、可展示的安全错误类型。

## 5. 当前第一项执行任务

下一次开发应从 Phase 8 开始，而不是直接部署 Worker：

1. 选定一个真实目标网站。
2. 确认登录状态检查接口。
3. 确认 Profile 接口和响应字段。
4. 确认 401、403、429、5xx 和超时行为。
5. 确认目标网站允许相关访问方式。
6. 根据确认结果编写真实 Target Adapter 规格。

在真实目标未确认前，保持当前演示 Target，不开放任意网站，不部署面向真实用户的生产扩展。

## 6. 回滚和发布原则

- 每个 Phase 保持小范围提交，能够独立回滚。
- 每个 Phase 完成后执行 typecheck、test、build 和 `git diff --check`。
- 生产发布前保留上一版 Worker、RemoteConfig 和扩展构建包。
- RemoteConfig 默认采用最小权限和关闭未知能力的策略。
- 不使用强制重置、强制推送或跳过校验的发布方式。
- 未经明确要求，不提交敏感配置、凭据或本地环境文件。