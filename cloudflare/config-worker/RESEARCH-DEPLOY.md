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
