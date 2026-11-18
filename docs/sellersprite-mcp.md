# SellerSprite MCP

This local MCP server exposes the SellerSprite operations already implemented by the Chrome extension. The extension makes requests with the existing logged-in browser session. MCP does not read, store, or return cookie values.

## Setup

1. Install workspace dependencies with pnpm install.
2. Generate a private random secret at least 32 characters long. In PowerShell:

   $bytes = New-Object byte[] 32
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $rng.GetBytes($bytes)
   $rng.Dispose()
   $env:SELLERSPRITE_MCP_TOKEN = [Convert]::ToBase64String($bytes)

3. Start the MCP server from the repository root, using the same secret:

   $env:SELLERSPRITE_MCP_TOKEN = "your-private-secret"
   pnpm start:sellersprite-mcp

   The bridge listens only on 127.0.0.1:32123. Set SELLERSPRITE_MCP_PORT to another available port if needed; update the extension bridge URL in source and rebuild if changing that port.

4. Build and load the unpacked **SellerSprite MCP 连接器** extension from apps/extension/.output/chrome-mv3 (or start pnpm dev:extension). Chrome 120 or later is required. Open the extension popup, expand the connection settings and save the same secret once. Existing saved secrets survive this update.
5. Allow the extension's SellerSprite site access, sign in to https://www.sellersprite.com in the same browser profile, and keep the extension enabled. The popup provides a SellerSprite login entry; credentials and cookies remain managed by the browser.
6. Configure the MCP client to launch this repository's pnpm command with the same token in its process environment. Example:

   {
     "mcpServers": {
       "sellersprite": {
         "command": "pnpm",
         "args": ["--dir", "F:/github project/cookie-amazon/cookie-amazon-platform", "start:sellersprite-mcp"],
         "env": { "SELLERSPRITE_MCP_TOKEN": "same-private-secret" }
       }
     }
   }

   Replace the example directory with the actual repository path. Do not commit the secret or put it in a shared configuration file.

   After updating, restart the MCP server process in the AI client to load the code and refresh the list of 21 tools. Compact output, keyword query reuse, and `sellersprite_read_result` affect only the local MCP process; no extension reload is needed. Restarting the process clears both query and result caches.

## Automatic connection

Extension 0.2.0 is a dedicated MCP connector. Its production build contains only the background worker and connection popup. The selection panel, Amazon card selection, in-page overlay and legacy Web UI relay are excluded from the build; Amazon and local Web UI host permissions are removed. SellerSprite capabilities, including product/category queries invoked by AI through MCP, remain available.

Once the secret is saved, no connection button or open popup is required. The background worker connects when loaded, on browser startup and extension installation/update. A persistent 30-second Chrome alarm restores the worker after suspension. Only one poller runs in a worker; changing or clearing the saved secret immediately cancels the old connection.

If the local MCP service stops or starts later, the connector retries automatically. Local bridge HTTP requests time out after 25 seconds; a network/server failure retries after 2 seconds, while a rejected secret retries after 30 seconds. The popup follows actual successful bridge responses and distinguishes connecting, connected, waiting for service, missing configuration and authentication mismatch. A saved secret alone is not displayed as a successful connection.

If a query finishes but result delivery fails, the connector retries the same result before claiming another job. Changing the secret within a worker preserves an in-flight query and delivers its result with the new secret. A restarted worker relies on the server lease to reissue pending read requests.

Automatic connection does not start a native program from the browser or log into SellerSprite with a password. The AI client's MCP configuration starts the local service; the extension reconnects to it. On first installation, configure the matching secret once and log into SellerSprite. After updating an unpacked extension, reload it once in Chrome to load the new build; subsequent browser/service restarts reconnect automatically.

## Available tools

There are 21 tools: the original 20 remain available, with `sellersprite_read_result` added for local result reading.

| Tool | Capability |
| --- | --- |
| sellersprite_ping | Check extension connectivity |
| sellersprite_status | Get SellerSprite permission, runtime status, and effective supported capabilities |
| sellersprite_check_login | Check SellerSprite login state without returning cookies |
| sellersprite_read_result | Read a cached large result by path, page, and direct fields without an upstream request |
| sellersprite_keyword_reverse | Find keywords for a US ASIN |
| sellersprite_asin_ad_analysis | Summarize ad and organic keyword positions for a US ASIN |
| sellersprite_ads_insights | Read SellerSprite's inferred competitor campaigns and ad group architecture |
| sellersprite_ads_history | Read available historical periods for an inferred competitor ad group |
| sellersprite_ads_keywords | Read inferred competitor ad group keywords for a selected period |
| sellersprite_ads_high_frequency | Read high-frequency terms for a selected inferred ad group and period; no pagination |
| sellersprite_monthly | Read monthly listing data for a US ASIN |
| sellersprite_market_research | Research a US product keyword |
| sellersprite_aba_periods | List available weekly/monthly ABA tables |
| sellersprite_aba_research | Query ABA keywords and metrics |
| sellersprite_competitor_research | Find competitors by exactly one of ASIN, keyword, brand, or seller |
| sellersprite_category_nodes | Browse SellerSprite category nodes |
| sellersprite_product_selection | Filter products by leaf category path and supported filters |
| sellersprite_review_comments | Read review comments for a US ASIN |
| sellersprite_keyword_mining | Find related US keywords |
| sellersprite_open_market_selection | Open the market selection page; returns completion status only |
| sellersprite_open_keyword_research | Open the keyword research page; returns completion status only |

The status tool reports the actual effective capabilities after SellerSprite permission and remote policy are applied. The MCP tool list describes what this integration knows how to invoke; it does not guarantee that a logged-in account or current plan has access to each feature. Two page-opening actions do not return the page's full analysis data.

`sellersprite_asin_ad_analysis` derives its summary from the same approved ASIN keyword reverse data as `sellersprite_keyword_reverse`. It reports ad/organic position counts and coverage, simple means of observed per-keyword traffic-ratio fields, and leading ad-position keywords with SellerSprite's estimated keyword bid range. Coverage is based on the returned keyword sample; bid estimates are not actual CPC. This is not SellerSprite's campaign advertising report and does not expose campaigns, ad groups, ACOS, CPC, or attributed sales.

## Query reuse and faster research

`sellersprite_keyword_reverse` and `sellersprite_asin_ad_analysis` share identical keyword reverse requests within the same MCP process. Matching in-flight requests use one upstream request. Successful results can be reused for **120 seconds after completion**, with at most **8 query keys**; reads do not extend expiry. The key includes ASIN, market, month, badges, and limit. The ad summary uses empty badges, so a filtered keyword query will not supply an unfiltered summary. Errors and invalid responses are not cached.

Both tools add `cache: {hit, expiresAt}` to their responses. `hit: true` means the response reused a completed or in-flight query, and its upstream `requestId` remains the original one. `expiresAt` is an ISO datetime for a successful query or `null` for an error. Other data tools and login/status checks do not use this query cache.

Set `refresh: true` on either tool to issue a new upstream request without forcing upstream recalculation:

```json
{
  "name": "sellersprite_keyword_reverse",
  "arguments": { "asin": "B0F9XY6HXB", "refresh": true }
}
```

`refresh` is local to MCP and is not forwarded to the extension. `forceReStat: true` also always issues a new request and retains its existing upstream recalculation semantics. A successful refresh can supply subsequent ordinary queries. This 120-second query cache is separate from the 15-minute large-result cache described below.

For research, read core keyword metrics first, then request trends as needed. Query advertising architecture before expanding relevant ad groups and periods. The extension still executes bridge jobs serially; this update does not add upstream concurrency. In a real historical 23-row keyword response, compact serialization reduced the JSON from 93,517 to 43,377 characters and complete row reads from 7 pages to 3; selecting `keywords`, `searches`, `natural`, `ad`, `bid`, `trafficPercentage`, `naturalRatio`, and `adRatio` took one page. These are local output measurements, not an end-to-end ASIN research timing or speed guarantee.

## Large results and local result reading

All responses use compact JSON without indentation; business fields are preserved. Any JSON response exceeding **16,000 characters** is replaced with `resultId`, `expiresAt` (ISO datetime), `totalChars` (the complete compact JSON length), `summary`, and `readTool: "sellersprite_read_result"`. The summary retains short scalars and objects to a limited depth; arrays become `{"type": "array", "length": n}`. It is not the complete business result.

The complete original response stays only in the current MCP process's memory for **15 minutes**, with at most **8 results** cached. Later large results may evict earlier ones; a process restart clears them all. Nothing is written to disk. Reading a cached result makes no additional upstream request and does not alter the cached original. Expired, evicted, or restart-cleared IDs return `RESULT_NOT_FOUND`; rerun the original tool to get a new ID.

`sellersprite_read_result` accepts a strict argument object; unknown fields are rejected:

| Field | Validation and behavior | Default |
| --- | --- | --- |
| `resultId` | Required UUID returned by the original tool | None |
| `path` | Array of string path segments, such as `["data", "items"]` or `["data", "items", "0", "searchesTrend"]`; use a string segment for an array index | `[]` (the original response root) |
| `offset` | Nonnegative integer; row offset for arrays or character offset for strings | `0` |
| `limit` | Integer from `1` to `20000`; arrays return at most 100 rows, strings can be read in chunks | `20` rows for arrays; `12000` characters for strings |
| `fields` | Optional array of strings selecting only direct fields of the selected object or each array row; not nested paths | No field selection |

Array reads return `{resultId, path, offset, total, items, hasMore, nextOffset}`. Here `total` is the selected cached array's length, and `nextOffset` is a number when more rows remain or `null` at the end. The tool automatically reduces the returned row count to keep the JSON response at or below 16,000 characters. **Continue with the actual `nextOffset` until `hasMore` is `false`; do not compute the next offset from the requested limit.**

If a single row or an object is too large, the tool returns `RESULT_PATH_TOO_LARGE` with available-field hints. Select fewer direct fields or use a deeper `path`; read long strings in chunks with `offset` and `limit`. For keyword rows, `fields: ["keywords", "searches", "natural", "ad", "bid"]` can omit trends while leaving the complete cached result intact.

This pagination reads only data actually fetched by the original call. An upstream `data.total` can exceed the fetched `data.items.length`; finishing the cached array does not mean all upstream keywords have been fetched.

### Example 1: keyword reverse returns a result ID

```json
{
  "name": "sellersprite_keyword_reverse",
  "arguments": { "asin": "B0F9XY6HXB" }
}
```

Illustrative large response (use the ID and expiry returned by your own call):

```json
{
  "resultId": "7be3a320-6c95-4dc1-9b52-8a5c9a1247e2",
  "expiresAt": "2026-11-17T08:15:00.000Z",
  "totalChars": 48000,
  "summary": {
    "data": {
      "total": 1200,
      "items": { "type": "array", "length": 75 }
    }
  },
  "readTool": "sellersprite_read_result"
}
```

### Example 2: select fields and follow the returned offset

```json
{
  "name": "sellersprite_read_result",
  "arguments": {
    "resultId": "7be3a320-6c95-4dc1-9b52-8a5c9a1247e2",
    "path": ["data", "items"],
    "offset": 0,
    "limit": 100,
    "fields": ["keywords", "searches", "natural", "ad", "bid"]
  }
}
```

If the response has `hasMore: true` and `nextOffset: 17`, repeat this read with `offset: 17`, keeping the same `resultId`, `path`, and `fields`. Continue with each actual `nextOffset` until `hasMore: false` and `nextOffset: null`. For the illustrative result above, this reads 75 cached rows; it does not fetch the remaining upstream keywords implied by `data.total: 1200`.

## Competitor advertising insights

The four `sellersprite_ads_*` tools use the existing local bridge and logged-in extension session to invoke fixed SellerSprite advertising insight operations. They read SellerSprite's **third-party inferred competitor advertising architecture, history, and keywords**. They are not seller backend reports and do not provide real budgets, actual CPC, ACOS, or attributed sales. An inferred campaign or ad group is not a confirmed copy of the competitor's actual account structure. A missing result does not establish that a product has no advertising.

This is distinct from `sellersprite_asin_ad_analysis`, which remains a summary of keyword reverse positions and does not call the advertising insight endpoints. SellerSprite's separate official `ads.insights.lookup` MCP service uses its own API key and quota rules; these local tools do not use that service. The [advertising insight evidence](superpowers/specs/2026-11-14-sellersprite-ads-insights-evidence.md) records the earlier endpoint and UI investigation, not the current implementation status.

| Local MCP tool | Fixed web API path (GET) |
| --- | --- |
| `sellersprite_ads_insights` | `/v3/api/xds/stat` |
| `sellersprite_ads_history` | `/v3/api/xds/stat/history` |
| `sellersprite_ads_keywords` | `/v3/api/xds/stat/keyword` |
| `sellersprite_ads_high_frequency` | `/v3/api/xds/stat/keyword/high-frequency` |

The web UI calls Sponsored Brands Video **SBV**, while the web API uses **`SPV`**. Pass `type: "SPV"` for SBV, `"SP"` for Sponsored Products, or `""` for no type filter. The observed UI describes SP and SBV keyword targeting; this does not establish coverage of product targeting, SB, or SD.

### Architecture and history inputs

Both tools accept these fields:

| Field | Validation | Default |
| --- | --- | --- |
| `asin` | Required, exactly 10 uppercase ASCII letters/digits | None |
| `market` | Numeric ID: `1`, `3`, `4`, `5`, `6`, `7`, `35691`, `44551`, `44571` | `1` (US) |
| `interval` | `"week"` or `"month"` | `"week"` |
| `months` | `3`, `6`, `12`, or `24`; `24` requires `interval: "month"` | `6` |

`sellersprite_ads_history` additionally requires a nonblank `adId` of at most 128 characters, with no control characters. It has no pagination or architecture filters.

`sellersprite_ads_insights` additionally accepts:

| Field | Validation | Default |
| --- | --- | --- |
| `desc` | Boolean | `false` |
| `pageNum` | Integer, 1–10000 | `1` |
| `pageSize` | Integer, 1–50 | `20` |
| `orderByEffectiveness` | Boolean | `false` |
| `type` | `""`, `"SP"`, or `"SPV"` (SBV) | `""` |
| `campaignId`, `adId` | Each at most 128 characters, with no control characters | `""` |
| `variation` | Empty string or a 10-character uppercase ASIN | `""` |
| `combination` | Boolean; request the web API's campaign-combination option | `false` |
| `brief` | Boolean; request the web API's brief/filter view | `false` |

### Keyword and high-frequency inputs

Both tools accept these fields:

| Field | Validation | Default |
| --- | --- | --- |
| `adId` | Required, nonblank, at most 128 characters, no control characters | None |
| `market` | Same numeric IDs as architecture queries | `1` |
| `interval` | `"week"` or `"month"` | `"week"` |
| `beginDate`, `endDate` | Required; nonnegative integer, or a date string as described below | None |
| `keyword` | At most 256 characters, no control characters | `""` |
| `orderField` | `"keyword"` or `"updatedTime"`; `searches` and `searchesRank` are not accepted | `"updatedTime"` |
| `desc` | Boolean | `true` |

Date strings must be nonempty, at most 40 characters, contain no control characters, and use `YYYY-MM-DD`, `YYYY-MM-DD HH:mm:ss`, an ISO datetime, or 8–13 digits. When both endpoints can be parsed, `beginDate` must not exceed `endDate`. Use the period values returned by history, with the same market and interval. Numeric values are forwarded without unit conversion.

Only `sellersprite_ads_keywords` accepts `pageNum` (integer 1–10000, default `1`) and `pageSize` (integer 1–50, default `50`). `sellersprite_ads_high_frequency` rejects both pagination fields because its web request omits them. All four input objects are strict: unknown fields are rejected. The MCP request builder fills every supported input field, including defaults and empty filters, before passing it to the protocol and extension.

### Query flow

1. Check `sellersprite_status` and `sellersprite_check_login` after restarting the MCP server and loading the matching extension. Registration alone does not establish account access or that live responses have been verified.
2. Query architecture, for example:

   ```json
   {
     "name": "sellersprite_ads_insights",
     "arguments": { "asin": "B0F9XY6HXB", "market": 1, "interval": "week", "months": 6 }
   }
   ```

3. Use an actual returned ad group ID as `adId` in `sellersprite_ads_history`, retaining the queried ASIN, market, interval, and months. Do not invent IDs or assume that an empty list means no advertising.
4. Use a returned period's `beginDate` and `endDate` plus `adId`, market, and interval in `sellersprite_ads_keywords` and/or `sellersprite_ads_high_frequency`. Keywords can be paged; high-frequency terms cannot.

The SDK process tests list the registered tools, reject invalid arguments without an extension, and inspect complete requests through an isolated local bridge fixture. They do not verify SellerSprite's live response structure, the account's entitlement, or historical data completeness.

Live verification on 2026-11-15 with extension 0.1.21 completed 15 successful MCP calls, including all four advertising tools, brief filters, and an exact variation filter. This verifies the tested account and requests, not every account entitlement or historical record. Numeric fields accompanying keywords are retained as upstream fields; they must not be represented as this competitor ASIN's actual attributed advertising impressions, clicks, or spend. Extension 0.2.0 additionally has automated connection and popup regression checks; loading it in a browser still requires reloading the unpacked extension.

## Troubleshooting

- BRIDGE_TIMEOUT: make sure Chrome is running with the extension enabled and that its saved bridge secret matches the MCP server's secret.
- TARGET_PERMISSION_MISSING: grant the extension SellerSprite site access in Chrome's extension settings.
- TARGET_NOT_LOGGED_IN: sign in to SellerSprite in Chrome and retry.
- TARGET_DISABLED or OPERATION_DISABLED: check the result from sellersprite_status; remote policy may disable the target or capability.
- Waiting for service: start the MCP client/server and confirm local port 32123 is available. The extension reconnects automatically.
- Authentication mismatch: save the same secret used by the local MCP service; saving replaces the old connection immediately.
- EXTENSION_UNAVAILABLE: ensure the connector is enabled in the same browser profile where SellerSprite is logged in. If upgrading an unpacked extension, reload it once to load the new version.
- RESULT_NOT_FOUND: the cached result expired, was evicted by later large results, or was cleared by an MCP process restart. Rerun the original tool and use its new result ID.
- RESULT_PATH_TOO_LARGE: use the available-field hints to select fewer direct fields or read a deeper path; use chunks for long strings.
- Missing sellersprite_read_result: restart the MCP server process in the AI client to load the update and refresh its 21-tool list. This MCP-only update does not require reloading the extension.

Only fixed protocol actions are accepted across the bridge. It is not an arbitrary URL, HTTP-header, or cookie proxy.
