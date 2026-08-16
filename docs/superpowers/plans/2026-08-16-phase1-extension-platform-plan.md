# Phase 1 扩展平台实施计划

## 1. 任务顺序
1. Monorepo/pnpm/TypeScript strict 基础
2. protocol 共享包和验证函数
3. WXT extension background/content script 与 webext-bridge 接入
4. web-sdk 受限 PING API、origin/timeout/error
5. React Web UI
6. Cloudflare config-worker + Static Assets 基础配置
7. 单元测试、typecheck、build、Chrome 手工验证、Wrangler 验证

## Phase 1 非目标
真实 Target API、Cookie/Session、订单、任意 Fetch、复杂 RemoteConfig、动态 Adapter、权限申请、Target API Proxy。

## 安全检查点
- 严格 origin 验证
- 未知 action/version 直接拒绝
- Web SDK 不暴露 URL/headers/body/fetch
- 不传 Cookie/Session/Auth
- Worker 不代理 Target API、不读取 Target Cookie、不写敏感日志
- 日志仅记录安全事件，无敏感信息

## 回滚策略
- 每个任务保持小范围、可独立回退；验证失败时只撤销当前任务涉及的文件。
- 优先使用版本控制中的新分支和明确的反向提交；未经用户明确要求，不执行强制重置、全量丢弃工作区等破坏性操作。
- 在进入下一任务前保留 typecheck/build 验证结果，便于定位回退边界。

## 各任务详情

**任务1：Monorepo/pnpm/TypeScript strict 基础**
- 目标：建立 monorepo 结构并配置 pnpm + TypeScript strict
- 涉及文件：pnpm-workspace.yaml, tsconfig.json, package.json (所有)
- 实现要点：添加 workspace 引用，启用 strict 模式，添加 build/test scripts
- 依赖：无
- 验证命令/验收条件：pnpm install 成功，tsc --noEmit 无错误，验收：目录结构完整

**任务2：protocol 共享包和验证函数**
- 目标：创建 packages/protocol 包并实现验证函数
- 涉及文件：packages/protocol/package.json, src/index.ts, src/validate.ts
- 实现要点：定义 protocolVersion=1, PING action, 验证函数检查 version/action/origin
- 依赖：任务1
- 验证命令/验收条件：typecheck 成功，单元测试覆盖验证逻辑

**任务3：WXT extension background/content script 与 webext-bridge 接入**
- 目标：集成 WXT Extension，并建立 Background、Content Script、Window 之间的消息通道。
- 涉及文件：`apps/extension/entrypoints/background.ts`、`apps/extension/entrypoints/content.ts`、`apps/extension/wxt.config.ts`、`apps/extension/package.json`、`apps/extension/src/` 中的桥接适配代码；通过 workspace 依赖使用 `webext-bridge`，不复制或修改参考目录源码。
- 实现要点：使用 webext-bridge 的 window/content-script/background 端点桥接 PING；只允许已定义的 PING action；在 Content Script 和 Background 各做一次协议校验。
- 依赖：任务2。
- 验证命令/验收条件：`pnpm --filter @cookie-amazon/extension typecheck`、`pnpm --filter @cookie-amazon/extension build` 成功；Chrome 加载后 PING 响应。

**任务4：web-sdk 受限 PING API、origin/timeout/error**
- 目标：实现 web-sdk PING
- 涉及文件：packages/web-sdk/src/api.ts, src/config.ts
- 实现要点：限制 PING 到 origin, 设置 timeout/error 处理
- 依赖：任务2
- 验证命令/验收条件：typecheck 成功，SDK 测试通过

**任务5：React Web UI**
- 目标：搭建 React Web UI
- 涉及文件：apps/web/src/App.tsx, 组件文件
- 实现要点：展示 PING 状态，连接到 web-sdk
- 依赖：任务4
- 验证命令/验收条件：build 成功，手工加载 UI 显示 PING 成功

**任务6：Cloudflare config-worker + Static Assets 基础配置**
- 目标：配置 Cloudflare Worker 和 Workers Static Assets，支持 Web UI 静态构建产物的部署入口。
- 涉及文件：`cloudflare/config-worker/src/index.ts`、`cloudflare/config-worker/wrangler.jsonc`、`cloudflare/config-worker/package.json`、必要的 Worker 资源配置。
- 实现要点：Worker 提供基础健康检查/静态资源 fallback；Phase 1 不实现 RemoteConfig 写入、不代理 Target API、不处理 Target Cookie。Web UI 通过构建产物接入 Static Assets，具体路径在实现时以 Wrangler 当前配置格式验证。
- 依赖：任务1、任务5。
- 验证命令/验收条件：`pnpm --filter @cookie-amazon/config-worker typecheck`、`pnpm --filter @cookie-amazon/config-worker dev` 成功；Wrangler 本地访问基础路由，响应不包含敏感数据。

**任务7：单元测试、typecheck、build、Chrome 手工验证、Wrangler 验证**
- 目标：完成所有验证
- 涉及文件：所有测试文件，package.json scripts
- 实现要点：运行 vitest, tsc, build, Chrome 加载测试, Wrangler
- 依赖：所有前置任务
- 验证命令/验收条件：所有命令通过，PING 成功，验收标准：PING 响应、所有安全边界生效

## 验收标准
- PING 成功响应
- 所有安全边界生效
- 目录结构完整
- 所有验证通过

## 文件创建验证
目录已创建：f:\github project\cookie-amazon\cookie-amazon-platform\docs\superpowers\plans
文件路径：f:\github project\cookie-amazon\cookie-amazon-platform\docs\superpowers\plans\2026-08-16-phase1-extension-platform-plan.md
大小：约 2.5KB (实际读取验证非空)