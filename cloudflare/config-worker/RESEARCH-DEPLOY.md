# 研究记录服务端部署

小组研究记录存 D1（表由 `migrations/0004_research_records.sql` 建立），接口在 `/api/research/records`。

## 成员与访问密钥

成员名单放在 Worker 的 **secret** `RESEARCH_MEMBERS`（不是 vars：里面有密钥摘要）：

```json
[
  { "name": "amy", "group": "team-a", "tokenHash": "<amy token 的 sha256>" },
  { "name": "ben", "group": "team-a", "tokenHash": "<ben token 的 sha256>" },
  { "name": "eve", "group": "team-b", "tokenHash": "<eve token 的 sha256>" }
]
```

只需要摘要，不需要明文，因此这份名单不是密钥清单。生成摘要：

```bash
node -e "const c=require('crypto');console.log(c.createHash('sha256').update(process.argv[1]).digest('hex'))" "<成员自己的 token>"
```

写入 secret：

```bash
cd cloudflare/config-worker
wrangler secret put RESEARCH_MEMBERS
```

## 应用迁移

```bash
cd cloudflare/config-worker
wrangler d1 migrations apply cookie-amazon-fashion --remote
```

## 约定

- 身份由服务端按访问密钥决定；请求体里的 `owner` / `group` 一律忽略。
- 查询始终按服务端小组限定，客户端无法指定看哪个组。
- 只有记录作者本人能覆盖自己的记录；同组同事只读。
- 未认证返回 401，作者不符返回 403——客户端遇到这两种情况不退回本地数据冒充隔离。

## 旧的本地记录

扩展早期把研究记录存在浏览器本地（`research-records:v1`）。这份数据**保留在原处、不会自动上传**：
它没有服务端认可的作者身份，自动发布会把无法追溯的结论混进小组记录。需要哪条就由本人重新填写。

## 词位原始响应缓存（#26）

旧 v1 条目没有小组来源，无法安全迁入身份分槽；升级后的首次查询可能重新取数。

应用 `migrations/0005_keyword_position_cache.sql` 迁移并部署 Worker 与扩展。缓存与研究记录共用 `RESEARCH_MEMBERS` 成员名单和令牌摘要鉴权；主键包含服务端的小组名。

扩展先查本地，再查服务端，未命中才向卖家精灵取数；成功取数后写两层。服务端不可用、未认证或拒绝超限载荷时，面板照常走本地与取数路径。有密钥的本地缓存按密钥摘要分槽，旧 `keyword-position-cache:v1` 条目不自动上传；无密钥时仍使用旧本地缓存。

端点 `/api/research/keyword-positions` 只接受 `asin` 和 `market`：ASIN 为 10 位字母数字，市场为 2–16 位字母。GET 命中返回原始字节与 `x-cache-age-ms`（服务端计算的毫秒年龄），未命中返回 404 CACHE_MISS。PUT 成功返回 204；非法键返回 400 BAD_REQUEST，超过 512 KiB 返回 413 PAYLOAD_TOO_LARGE。服务端按自身时钟判断 24 小时有效期，不解析载荷结构。

仓库根目录运行回归验证：

```bash
pnpm typecheck
pnpm --filter @cookie-amazon/config-worker exec vitest run src/__tests__/keyword-position-cache-api.test.ts
pnpm --filter @cookie-amazon/extension exec vitest run src/__tests__/keyword-position-cache.test.ts src/__tests__/keyword-position-cache-client.test.ts src/panel/__tests__/analysis-panel.test.ts
pnpm test
```
