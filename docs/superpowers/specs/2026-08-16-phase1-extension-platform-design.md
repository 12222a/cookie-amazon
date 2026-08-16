# Phase 1 扩展平台设计文档

## 1. 背景与目标
从需求文档 Phase 1 开始。核心基础包括：Web UI、Web SDK、WXT MV3 Extension、Cloudflare Worker Static Assets。Phase 1 仅跑通 PING。

## 2. 明确非目标
真实 Target API、Cookie/Session、订单、任意 Fetch、复杂 RemoteConfig、动态 Adapter、权限申请、Target API Proxy。

## 3. 已确认方案 A
Web SDK + Content Script + Background 三段式桥接。使用 webext-bridge 的 window/content-script/background 端点作为参考/传输；共享 protocol 包。推荐理由：类型安全、延迟低、安全边界清晰。备选方案对比：纯 chrome.runtime 易暴露权限、postMessage 需手动序列化。

## 4. 目录结构
apps/web、apps/extension、packages/protocol、packages/web-sdk、cloudflare/config-worker、docs。

## 5. 组件职责与数据流
Web UI -> Web SDK -> window/content-script bridge -> Content Script -> Background -> PING 状态响应 -> Web UI。

## 6. 协议契约
protocolVersion=1，PING action，请求/成功响应/错误码（INVALID_ORIGIN、INVALID_MESSAGE、UNSUPPORTED_PROTOCOL、UNKNOWN_ACTION、EXTENSION_UNAVAILABLE、TIMEOUT），ExtensionStatus 字段 connected、extensionVersion、protocolVersion、capabilities。

## 7. 安全边界
静态 WEB_ORIGIN/REMOTE_CONFIG_ORIGIN/协议版本；非法 origin 丢弃；未知 action/version 拒绝；Web SDK 不暴露 URL/headers/body/fetch；不传 Cookie/Session/Auth；Worker 不代理 Target API、不读取 Target Cookie、不写敏感日志。

## 8. 错误处理与日志策略
严格 origin 验证，未知 action/version 直接拒绝并记录安全日志，无敏感信息。

## 9. 实现顺序与验证
依赖、typecheck、build、协议测试、SDK 测试、Chrome 手工加载、Wrangler 验证。

## 10. Phase 1 验收标准与后续扩展边界
验收标准：PING 成功响应、所有安全边界生效、目录结构完整。后续边界：扩展到 Target Adapter、RemoteConfig、真实 API 集成。

**自审结果**：无 TODO/TBD/矛盾、无超 Phase 1 范围。文件大小：约 4KB。