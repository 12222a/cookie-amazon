# Phase 9 SellerSprite 网页会话 Adapter 规格

## 1. 状态

- 阶段：Phase 9
- 状态：进行中
- 已确认契约：见 `2026-08-17-sellersprite-web-contract-evidence.md`
- 当前切片：注册真实 SellerSprite Target，实现安全登录正向探测，冻结全部已确认网页 Endpoint。

## 2. 目标

在现有 Registry、Permission、Runtime Policy、Background 和 Web SDK 链路中接入固定 SellerSprite Target。浏览器负责自动携带目标站点 Cookie，但平台代码不读取、复制、存储或向 Web 返回 Cookie。

调用链：

```text
Web SDK
  -> Protocol
  -> Content/Background bridge
  -> Target Registry + Permission + Runtime Policy
  -> SellerSprite Adapter
  -> 固定 Origin/Path/Method transport (credentials: include)
  -> 最小化、安全响应
```

## 3. 模块边界

### 3.1 领域契约

`packages/sellersprite` 负责：

- 固定 Origin 和 optional permission origin。
- 能力 ID。
- 已确认 Endpoint 的 pathname、method 和 response kind。
- 不包含请求参数值、凭据或任意 URL。

### 3.2 通用 Target Client

`apps/extension/src/targets/client.ts` 负责：

- 固定 adapter origin 与 operation policy。
- `credentials: 'include'`。
- 超时和协议错误映射。
- JSON parser 与 HTML login probe parser 分离。

### 3.3 SellerSprite Adapter

`apps/extension/src/targets/sellersprite.ts` 负责：

- 将 `CHECK_LOGIN` 绑定到 `GET /v2/me` HTML 探测。
- 禁用未设计的 Profile 能力。
- 不读取 HTML 正文，只检查状态码、content-type、最终 origin/pathname。

### 3.4 Bridge

现有 `CHECK_LOGIN` Protocol、Background 和 Web SDK 链路保持不变，通过静态 Registry 新增的 `sellersprite` target 实现端到端接入。

## 4. 安全不变量

- Origin 只能是 `https://www.sellersprite.com`。
- optional host permission 只能是 `https://www.sellersprite.com/*`。
- Endpoint 由编译期常量定义，调用方不能传 URL、Path 或 Method。
- 请求不接受调用方 headers、Cookie、Authorization、Session 或 `secret-key`。
- Cookie 只由浏览器根据 `credentials: 'include'` 自动管理。
- HTML login probe 不调用 `response.text()`，不返回或保存 HTML。
- 最终 URL 若跳转到其他 Origin，响应无条件拒绝。
- 同 Origin 但未停留在 `/v2/me` 时只返回未登录，不返回重定向目标给 Web。
- RemoteConfig 不能更改已编译 Endpoint、Method、Response parser 或扩大超时。
- GET_PROFILE 对 SellerSprite 保持禁用，防止个人资料越过扩展边界。

## 5. 登录检测契约

输入：仅 `targetId: 'sellersprite'`。

请求：

```text
GET https://www.sellersprite.com/v2/me
credentials: include
```

结果：

```ts
type LoginResult = { loggedIn: boolean }
```

判定：

- `401`/`403`：`loggedIn: false`。
- `429`：`TARGET_RATE_LIMITED`。
- 非成功状态：`TARGET_API_ERROR`。
- 非 HTML：`TARGET_RESPONSE_INVALID`。
- 最终 Origin 不匹配：`TARGET_RESPONSE_INVALID`。
- 最终 pathname 为 `/v2/me` 且无 Query/Hash：`true`。
- 同 Origin 其他 pathname：`false`。

未登录重定向目标尚未通过脱敏证据确认，因此不将猜测的登录 pathname 编入契约。

## 6. 后续业务 Adapter 设计

后续能力不得塞入通用 `TargetClient.execute` 的单一 JSON parser，应新增 SellerSprite 专用命令层：

```text
SellerSpriteCommand
  -> capability-specific input validator
  -> static request descriptor
  -> JsonSessionTransport | HtmlSessionTransport
  -> capability-specific response minimizer
```

### JSON 能力

- 关键词反查
- 查竞品
- 选产品
- 关键词挖掘

每个命令必须分别冻结 Query/Body allowlist、分页上限和返回字段 Schema。

### HTML 能力

- 选市场
- 关键词选品

必须先设计稳定且不泄露正文的结果抽取 Schema。在此之前只冻结契约，不接入 Web SDK，禁止将 HTML 当 JSON 解析或原样返回。

## 7. 当前验收

- [x] 脱敏 Network 证据写入仓库文档。
- [x] SellerSprite Web 契约从 pending 更新为 confirmed。
- [x] SellerSprite Target 注册到静态 Registry。
- [x] optional host permission 固定到 SellerSprite Origin。
- [x] 登录探测使用 `credentials: include`。
- [x] HTML 正文不被读取或返回。
- [x] Profile 能力禁用。
- [ ] 业务 JSON 命令输入/输出 Schema 与 Protocol payload 接入。
- [ ] HTML 两项能力的安全结构化提取器。
- [ ] 未登录重定向行为实测。
- [ ] Chrome 手动冒烟验证。