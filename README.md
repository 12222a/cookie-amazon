# SellerSprite MCP 连接器 / Cookie Amazon Platform

通过本机 MCP 服务，让支持 MCP 的 AI 客户端复用 Chrome 中已登录的卖家精灵（SellerSprite）会话，调用本项目支持的关键词、市场、竞品、选品、评论和广告研究工具。使用时保持 Chrome 和扩展启用，无需打开 Web 工作台。

**当前扩展版本：0.2.0。** 这一版本只作为 MCP 连接器，安装包包含后台连接服务和连接设置弹窗。选品面板、亚马逊卡片选中、页面浮层、内容脚本注入及旧 Web 工作台桥接已移出安装包；历史研究界面源码保留。AI 通过 MCP 查询类目、筛选产品等数据能力仍然保留。

## 可以调用的 21 个 MCP 工具

以下名称与 [MCP 工具文档](docs/sellersprite-mcp.md)及[服务注册源码](apps/sellersprite-mcp/src/index.ts)一致。参数、支持的站点、日期格式和查询限制见 [docs/sellersprite-mcp.md](docs/sellersprite-mcp.md)。

### 连接、登录与结果读取（4 个）

| 工具名 | 用途 |
| --- | --- |
| `sellersprite_ping` | 检查扩展与本机 MCP 服务是否连通。 |
| `sellersprite_status` | 读取卖家精灵站点权限、运行状态、远程启用策略和当前有效能力。 |
| `sellersprite_check_login` | 检查当前浏览器的卖家精灵登录状态，不返回 Cookie 值。 |
| `sellersprite_read_result` | 按路径、分页和直属字段读取当前 MCP 进程缓存的完整大结果，不发起上游请求。 |

### 关键词与 ABA 研究（4 个）

| 工具名 | 用途 |
| --- | --- |
| `sellersprite_keyword_reverse` | 反查美国站 ASIN 的关键词。 |
| `sellersprite_keyword_mining` | 挖掘美国站相关关键词及搜索指标。 |
| `sellersprite_aba_periods` | 列出可用的 ABA 周度、月度数据周期。 |
| `sellersprite_aba_research` | 按周期、关键词和站点查询 ABA 搜索词及指标。 |

### 市场、竞品与选品（5 个）

| 工具名 | 用途 |
| --- | --- |
| `sellersprite_monthly` | 读取美国站 ASIN 的月度 Listing 数据。 |
| `sellersprite_market_research` | 按美国站产品关键词查询市场研究数据。 |
| `sellersprite_competitor_research` | 按 ASIN 列表、关键词、品牌或卖家查询竞品，每次只选一种查询条件。 |
| `sellersprite_category_nodes` | 浏览类目节点，按父级路径查询下级类目。 |
| `sellersprite_product_selection` | 按末级类目路径和支持的筛选条件查询产品，可先通过类目工具取得路径。 |

### 广告分析（5 个）

| 工具名 | 用途 |
| --- | --- |
| `sellersprite_asin_ad_analysis` | 根据美国站 ASIN 关键词反查样本，汇总广告位、自然位及覆盖情况。 |
| `sellersprite_ads_insights` | 读取卖家精灵推断的竞品广告活动、广告组架构。 |
| `sellersprite_ads_history` | 读取推断广告组可查询的历史周期。 |
| `sellersprite_ads_keywords` | 读取指定推断广告组、指定历史周期的关键词，支持分页。 |
| `sellersprite_ads_high_frequency` | 读取指定推断广告组、指定历史周期的高频词，不支持分页。 |

四个 `sellersprite_ads_*` 工具读取的是卖家精灵提供的**第三方推断数据**，包括竞品广告架构、历史、关键词和高频词。它们不提供卖家后台报表、真实预算、实际 CPC、ACOS 或归因销售额；推断的活动和广告组不能视为竞品账户真实结构的确认，空结果也不能证明该产品没有投广告。

`sellersprite_asin_ad_analysis` 单独使用关键词反查数据生成摘要，覆盖情况仅针对返回的关键词样本，不读取上述广告洞察接口，也不提供广告活动、广告组或实际投放绩效。

广告查询通常按以下顺序进行：先调用 `sellersprite_ads_insights` 取得实际返回的广告组 ID，再用 `sellersprite_ads_history` 取得历史周期，最后将同一广告组、站点、周期类型和返回的起止日期用于关键词或高频词查询。具体参数见 [MCP 广告洞察说明](docs/sellersprite-mcp.md#competitor-advertising-insights)。

### 评论与页面入口（3 个）

| 工具名 | 用途 |
| --- | --- |
| `sellersprite_review_comments` | 读取美国站 ASIN 的评论。 |
| `sellersprite_open_market_selection` | 打开市场选品页，仅返回操作完成状态。 |
| `sellersprite_open_keyword_research` | 打开关键词产品研究页，仅返回操作完成状态。 |

两个页面入口工具不返回页面的完整分析数据。各工具的实际可用性受浏览器站点权限、卖家精灵登录状态、账户套餐及远程策略影响；可先通过 `sellersprite_status` 查看当前有效能力。工具清单仅列出本项目已接入的操作，不代表覆盖卖家精灵所有网页功能。

### 大结果与按需读取

原有 20 个工具保留。所有响应使用紧凑 JSON，移除缩进空白，保留业务字段。任何超过 **16,000 字符**的 JSON 响应改为返回 `resultId`、ISO 格式的 `expiresAt`、`totalChars`、`summary` 和 `readTool: "sellersprite_read_result"`。`summary` 仅保留短标量、有限层级对象，数组表示为 `{type: 'array', length: n}`，不是完整业务结果。

完整原响应只保存在当前 MCP 进程内存中 **15 分钟，最多 8 份**，不落盘；后来的大结果可能淘汰旧结果，进程重启会清空缓存。使用 `sellersprite_read_result` 的路径段数组（如 `["data", "items"]`）读取，`fields: ["keywords", "searches", "natural", "ad", "bid"]` 可略过趋势字段，完整缓存保持不变。数组每次最多 100 行，并会为满足字符限制减少行数；必须用实际返回的 `nextOffset` 继续，直到 `hasMore: false`。

这些分页只读取本次实际取回的数据；`data.total` 可能大于已取回的 `items.length`，不能据此声称已取回上游所有关键词。缓存过期、被淘汰或进程重启后返回 `RESULT_NOT_FOUND`，需重跑原工具。严格参数、过大字段处理和两个调用示例见[结果读取说明](docs/sellersprite-mcp.md#large-results-and-local-result-reading)。

`sellersprite_keyword_reverse` 与 `sellersprite_asin_ad_analysis` 共用关键词查询：相同参数的在途请求合并，成功结果在本机复用 **120 秒，最多 8 个查询键**；错误不缓存。两者返回 `cache.hit` 和 `cache.expiresAt`。需要重新请求时传 `refresh: true`；`forceReStat: true` 也始终重新请求，并保留原有上游重新统计语义。这与上述 15 分钟的大结果读取缓存分别计时。

调研时先读关键词、搜索量、自然位、广告位和建议竞价等核心字段，需要时再读趋势；广告洞察先看架构，再展开相关广告组和时间段。当前扩展仍按任务串行执行，本次没有新增上游并发。历史真实的 23 行关键词样本，紧凑输出使完整分页读取从 7 批降为 3 批，选取核心字段只需 1 批；这不是完整 ASIN 调研的耗时测量。

## 安装与首次配置

### 准备环境

- Git、Node.js 和 pnpm 可在命令行使用。已核实环境：**Node.js v24.12.0、pnpm 10.33.2**。
- Chrome **120 及以上**，以及能在该浏览器配置文件中登录的卖家精灵账户。
- 支持启动本机 stdio MCP 服务的 AI 客户端。

以下命令以 PowerShell 为例。先克隆本仓库，在仓库的任意子目录打开终端；通过 Git 定位包含本 README、`package.json` 和 `apps/` 的仓库根目录，无需使用作者的本机路径。

### 1. 安装依赖并构建扩展

```powershell
$projectRoot = (git rev-parse --show-toplevel).Trim()
Set-Location -LiteralPath $projectRoot
pnpm install
pnpm --filter @cookie-amazon/extension build
```

构建目录为仓库根目录下的 `apps/extension/.output/chrome-mv3`。后续 AI 客户端配置中的仓库路径也使用这里的 `$projectRoot` 实际值。

### 2. 首次生成本机连接密钥

首次配置需要一个至少 32 个字符的随机私密密钥，供扩展与本机 MCP 服务匹配。已有密钥可继续沿用，无需重新生成。以下命令生成密钥并复制到本机剪贴板，供后续粘贴到扩展和 AI 客户端配置：

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$env:SELLERSPRITE_MCP_TOKEN = [Convert]::ToBase64String($bytes)
Set-Clipboard -Value $env:SELLERSPRITE_MCP_TOKEN
```

实际密钥只填写在自己的本机配置中，不要提交到 GitHub 或放入共享文档。

### 3. 加载 Chrome 扩展并登录卖家精灵

1. 打开 `chrome://extensions`，开启“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择刚构建的 `apps/extension/.output/chrome-mv3` 目录。
3. 打开“SellerSprite MCP 连接器”弹窗，展开连接设置，保存上一步的密钥。
4. 在 Chrome 的扩展设置中允许该扩展访问卖家精灵站点。
5. 在同一 Chrome 配置文件中登录卖家精灵；也可通过扩展弹窗中的登录入口打开网站。

密码和登录 Cookie 由浏览器管理，无需向 AI 提供。此时若本机 MCP 服务尚未启动，扩展会等待服务。

### 4. 配置 AI 客户端启动本机 MCP

在 AI 客户端添加本机 stdio MCP 服务。下面是使用 `mcpServers` 配置格式的示例；按所用客户端的格式填写等效的命令、参数和环境变量即可：

```json
{
  "mcpServers": {
    "sellersprite": {
      "command": "pnpm",
      "args": [
        "--dir",
        "<仓库根目录的绝对路径>",
        "start:sellersprite-mcp"
      ],
      "env": {
        "SELLERSPRITE_MCP_TOKEN": "<与扩展相同的本机私密密钥>"
      }
    }
  }
}
```

将路径占位符替换为第 1 步定位的仓库根目录，将密钥占位符替换为第 2 步生成或已有的密钥。`--dir` 使启动命令不依赖 AI 客户端的工作目录。仅在终端设置环境变量不会自动修改已运行的 AI 客户端配置，需在客户端中保存同一密钥。

保存配置并按客户端要求启用或重启 MCP 服务。**本机 MCP 进程由 AI 客户端启动**，扩展负责连接它；扩展不会自行启动本机程序或代替用户登录。桥接默认仅监听 `127.0.0.1:32123`，更改端口及其他配置的要求见 [MCP 配置文档](docs/sellersprite-mcp.md#setup)。

### 5. 发起第一次调用

在 AI 客户端中依次调用 `sellersprite_ping`、`sellersprite_status` 和 `sellersprite_check_login`，分别检查连接、当前有效能力和登录状态。例如：

```text
请依次调用 sellersprite_ping、sellersprite_status、sellersprite_check_login，
说明当前连接、可用能力和登录状态；确认可用后，
调用 sellersprite_keyword_mining 查询美国站关键词 camping tent。
```

选品也可以直接交给 AI 调用数据工具：

```text
请先用 sellersprite_category_nodes 逐级查找目标类目的末级路径，
再用 sellersprite_product_selection 按该路径和工具支持的筛选条件查询产品。
```

这些是调用步骤示例，结果以当前账户权限和上游返回为准。所有工具的详细参数见 [docs/sellersprite-mcp.md](docs/sellersprite-mcp.md)。

## 自动连接、真实状态与更新

首次保存匹配的密钥后，后台会在浏览器启动、扩展加载或更新时自动连接；本机 MCP 服务晚于浏览器启动、停止后恢复或连接中断时，扩展会自动重试。无需保持弹窗打开，也无需每次手动点击连接。已有保存的密钥自动沿用。

弹窗依据实际桥接响应显示未配置、连接中、已连接、等待服务或密钥不匹配等状态。仅保存密钥不会被显示为连接成功；本机桥接已连接也不等于卖家精灵已登录，可分别通过状态和登录工具检查。

升级已解压扩展时，重新构建后在 `chrome://extensions` 中点击一次“重新加载”以载入新版本。随后浏览器或本机服务重启时会按上述机制自动连接。

本次紧凑输出、关键词查询复用和 `sellersprite_read_result` 仅修改本机 MCP 进程，无需重载扩展。更新后需在 AI 客户端重启 MCP 服务进程，以载入代码并刷新包含 21 个工具的列表；重启会清空已有查询和结果缓存。

若停留在等待服务状态，检查 AI 客户端是否启动了 MCP 服务及本机端口是否可用；密钥不匹配时保存与服务相同的密钥。若返回 `TARGET_PERMISSION_MISSING`，在 **Chrome 扩展设置**中允许卖家精灵站点访问；若返回 `TARGET_NOT_LOGGED_IN`，在同一浏览器配置文件中登录后重试。其他错误见 [故障排查](docs/sellersprite-mcp.md#troubleshooting)。

## 本地开发与手工检查

### 连接器开发

在仓库任意子目录运行：

```powershell
Set-Location -LiteralPath (git rev-parse --show-toplevel)
pnpm dev:extension
```

需要单独调试本机 MCP 服务时，在另一个已设置相同 `SELLERSPRITE_MCP_TOKEN` 环境变量的终端运行：

```powershell
Set-Location -LiteralPath (git rev-parse --show-toplevel)
pnpm start:sellersprite-mcp
```

单独调试时，先停用 AI 客户端启动的同一服务，避免重复占用桥接端口。

可手工检查：关闭扩展弹窗后发起 MCP 查询；停止并重启本机服务后观察连接恢复；重启浏览器后观察自动连接。当前 0.2.0 安装包的页面范围也可检查：亚马逊页面不应出现旧选中控件或浮层，扩展安装包不应包含内容脚本或选品侧边栏。

### 开发者检查命令

```powershell
Set-Location -LiteralPath (git rev-parse --show-toplevel)
pnpm typecheck
pnpm test
pnpm build
```

### 可选：历史 Web / Worker 开发

历史 Web / Worker 可以单独运行。使用 MCP 连接器无需启动它们。Worker 启动后的健康检查：

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/health
```

Phase 2 配置接口：

```text
GET http://localhost:8787/api/extension/config
```

Worker 从 `EXTENSION_CONFIG` Workers KV 的 `extension:production:config` 读取配置，默认 TTL 为 30 分钟。Wrangler 本地开发使用本地 KV 模拟；部署前需要将 `wrangler.jsonc` 中的 KV namespace `id` 替换为真实 namespace，并按环境设置 `CONFIG_ENVIRONMENT`。配置读取失败时仅在当前 Worker 实例内使用 Last Known Good（LKG），没有有效配置则返回 503。

## 会话与调用边界

MCP 只接受固定能力及其经过校验的参数，不接受任意 URL、Header 或 Cookie。目标站点的禁用策略、Host 权限、登录状态和请求错误仍由现有适配器处理。浏览器不会向 AI 导出 Cookie 值；本机 MCP 服务也不读取、存储或返回 Cookie 值。
