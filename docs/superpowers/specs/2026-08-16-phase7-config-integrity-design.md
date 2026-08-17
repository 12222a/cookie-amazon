# Phase 7：RemoteConfig 完整性、缓存协商与可观测部署基础

## 背景

Phase 1-5 已建立受 Origin、Target Registry、Host Permission、Operation Policy 和 RemoteConfig 静态交集约束的能力链路；Phase 6 规划中的 Web SDK 能力已随 Phase 5 完成。本阶段进入生产化前的安全增强，不能改变已编译能力上限。

## 本阶段切片

本切片先实现 RemoteConfig 的 ETag 条件请求：

- Worker 为有效配置生成稳定 ETag。
- Extension 发送 `If-None-Match`，收到 `304` 时继续使用本地有效配置。
- 配置内容、Target Origin、权限、Header 和 Operation Policy 不因 ETag 改变。
- 304 没有 LKG 时视为不可用，不创建能力。
- 现有 TTL、LKG、无凭据请求和超时行为保持不变。

后续切片再实现 RemoteConfig 签名、版本/回滚接口、脱敏安全事件和 Chrome/Edge 发布矩阵；签名密钥不能进入 Extension 或公开 Worker 响应。

## 安全边界

- ETag 只用于缓存协商，不是完整性证明。
- `If-None-Match` 只允许影响缓存命中，不允许绕过 Schema 校验。
- Extension 继续使用 `credentials: omit`，不发送 Cookie、Authorization 或 Session。
- Worker 不代理 Target API，不接收 Target 凭据。
- RemoteConfig 仍只能收窄本地静态 Adapter、Endpoint、权限和 Operation 能力。

## 验收标准

- 有效配置响应包含稳定 ETag。
- 匹配 ETag 返回 304 且无配置体。
- Extension 对 304 使用有效 LKG；没有缓存时返回 null。
- 非 200/304、无效 JSON、无效 Schema、超时仍遵循原有回退策略。
- 单元测试、typecheck、build 全部通过。
- 构建 Manifest 不新增 Target Host 权限。