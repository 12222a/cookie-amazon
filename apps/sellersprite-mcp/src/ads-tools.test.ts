import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { isSellerSpriteAdsRequest, isSellerSpriteKeywordReverseRequest, type SellerSpriteKeywordItem } from '@cookie-amazon/protocol'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const token = 'test-ads-token-with-at-least-32-characters'
const client = new Client({ name: 'ads-registration-test', version: '1.0.0' })
let transport: StdioClientTransport
let base: string

const insightsArgs = { asin: 'B0F9XY6HXB' }
const historyArgs = { ...insightsArgs, adId: 'group-1' }
const keywordArgs = { adId: 'group-1', beginDate: '2026-09-01', endDate: '2026-10-31' }
const names = ['sellersprite_ads_insights', 'sellersprite_ads_history', 'sellersprite_ads_keywords', 'sellersprite_ads_high_frequency']

beforeAll(async () => {
  const port = await new Promise<number>((resolve, reject) => {
    const socket = createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      if (!address || typeof address === 'string') {
        socket.close()
        reject(new Error('NO_TEST_PORT'))
        return
      }
      socket.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
  base = 'http://127.0.0.1:' + port
  transport = new StdioClientTransport({
    command: process.execPath, args: ['--import', 'tsx', 'src/index.ts'],
    cwd: fileURLToPath(new URL('../', import.meta.url)), stderr: 'pipe',
    env: { ...getDefaultEnvironment(), SELLERSPRITE_MCP_TOKEN: token, SELLERSPRITE_MCP_PORT: String(port) },
  })
  let stderr = ''
  transport.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  try {
    await client.connect(transport)
  } catch (error) {
    throw new Error('MCP fixture failed to start: ' + stderr, { cause: error })
  }
}, 15000)

afterAll(async () => { await client.close(); await transport?.close() })

const post = (path: string, body: unknown = {}) => fetch(base + path, {
  method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
  body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
})

const keywordItem = (index = 0, months = 0): SellerSpriteKeywordItem => ({
  keywords: 'camping tent ' + index, searches: 1000, products: 200, supplyDemandRatio: 5,
  trafficPercentage: 0.1, purchaseRate: 0.05, bid: 1.2, bidMin: 1, bidMax: 1.5,
  avgPrice: 20, avgRating: 4.5, avgReviews: 50,
  searchesTrend: Array.from({ length: months }, (_, month) => ({
    month: 'month-' + month, searchRank: 1000 + month, searches: 2000 + month,
  })),
  natural: { page: 1, rank: index + 1 }, ad: null, naturalRatio: 0.8, adRatio: 0.2, positionTypes: ['NT'],
})

const answerKeywordQuery = async (items = [keywordItem()], failure = false) => {
  const poll = await post('/v1/bridge/poll')
  expect(poll.status).toBe(200)
  const pending = await poll.json() as { requestId: string; request: unknown }
  if (!isSellerSpriteKeywordReverseRequest(pending.request)) throw new Error('EXPECTED_KEYWORD_REQUEST')
  const response = {
    namespace: pending.request.namespace, protocolVersion: pending.request.protocolVersion,
    kind: 'response', requestId: pending.requestId, action: pending.request.action,
    ...(failure ? { ok: false, error: { code: 'TARGET_NOT_LOGGED_IN' } } : {
      ok: true, data: { asin: pending.request.payload.input.asin, total: 500, items },
    }),
  }
  expect((await post('/v1/bridge/result', { requestId: pending.requestId, response })).status).toBe(200)
  return pending.request
}

describe('SellerSprite advertising tools over the MCP SDK', () => {
  it('lists four strict tools and exposes only the web API sort and pagination fields', async () => {
    const { tools } = await client.listTools()
    for (const name of names) {
      const tool = tools.find((item) => item.name === name)
      expect(tool, name).toBeDefined()
      expect(tool?.inputSchema.additionalProperties).toBe(false)
      expect(tool?.description).toContain('third-party inferred competitor advertising')
      expect(tool?.description).toContain('does not provide real budgets, CPC, or ACOS')
    }
    for (const name of names.slice(2)) {
      const properties = tools.find((item) => item.name === name)?.inputSchema.properties
      expect(properties?.orderField).toMatchObject({ enum: ['keyword', 'updatedTime'], default: 'updatedTime' })
    }
    const highFrequency = tools.find((item) => item.name === names[3])?.inputSchema.properties
    expect(highFrequency).not.toHaveProperty('pageNum')
    expect(highFrequency).not.toHaveProperty('pageSize')
  })

  it.each<[string, Record<string, unknown>]>([
    [names[0], { ...insightsArgs, extra: true }],
    [names[1], { ...historyArgs, extra: true }],
    [names[2], { ...keywordArgs, extra: true }],
    [names[3], { ...keywordArgs, extra: true }],
    [names[0], { asin: 'b0f9xy6hxb' }],
    [names[0], { asin: insightsArgs.asin + String.fromCharCode(10) }],
    [names[0], { ...insightsArgs, market: 2 }],
    [names[0], { ...insightsArgs, months: 24 }],
    [names[1], { ...historyArgs, months: 24 }],
    [names[1], { ...historyArgs, adId: '   ' }],
    [names[0], { ...insightsArgs, campaignId: 'campaign' + String.fromCharCode(0x7f) }],
    [names[1], { ...historyArgs, adId: 'group-1' + String.fromCharCode(10) }],
    [names[2], { ...keywordArgs, beginDate: '2026-11-01' }],
    [names[2], { ...keywordArgs, beginDate: '2026-13-01' }],
    [names[2], { ...keywordArgs, beginDate: -1 }],
    [names[2], { ...keywordArgs, beginDate: 1.5 }],
    [names[2], { ...keywordArgs, orderField: 'searches' }],
    [names[3], { ...keywordArgs, orderField: 'searchesRank' }],
    [names[2], { ...keywordArgs, pageSize: 51 }],
    [names[3], { ...keywordArgs, pageNum: 1 }],
    [names[3], { ...keywordArgs, pageSize: 50 }],
    [names[3], { ...keywordArgs, beginDate: '1793491200000', endDate: '1788220800000' }],
  ])('rejects invalid %s arguments before contacting an extension: %j', async (name, args) => {
    const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 3000 })
    expect(response.isError).toBe(true)
    expect(JSON.stringify(response.content)).toContain('Input validation error')
  })

  it.each([
    {
      name: names[0], args: insightsArgs,
      expected: {
        ...insightsArgs, market: 1, interval: 'week', months: 6, desc: false, pageNum: 1, pageSize: 20,
        orderByEffectiveness: false, type: '', campaignId: '', adId: '', variation: '', combination: false, brief: false,
      },
    },
    {
      name: names[1], args: { ...historyArgs, interval: 'month', months: 24 },
      expected: { ...historyArgs, market: 1, interval: 'month', months: 24 },
    },
    {
      name: names[2], args: keywordArgs,
      expected: { ...keywordArgs, market: 1, interval: 'week', pageNum: 1, pageSize: 50, keyword: '', orderField: 'updatedTime', desc: true },
    },
    {
      name: names[3], args: { ...keywordArgs, orderField: 'keyword' },
      expected: { ...keywordArgs, market: 1, interval: 'week', keyword: '', orderField: 'keyword', desc: true },
    },
    {
      name: names[0], args: { ...insightsArgs, type: 'SPV', interval: 'month', months: 24 },
      expected: {
        ...insightsArgs, market: 1, interval: 'month', months: 24, desc: false, pageNum: 1, pageSize: 20,
        orderByEffectiveness: false, type: 'SPV', campaignId: '', adId: '', variation: '', combination: false, brief: false,
      },
    },
    ...[
      { beginDate: 0, endDate: 0 },
      { beginDate: '1788220800000', endDate: '1793404800000' },
      { beginDate: '2026-09-01 00:00:00', endDate: '2026-10-31 23:59:59' },
      { beginDate: '2026-09-01T00:00:00+08:00', endDate: '2026-10-31T23:59:59Z' },
    ].map((dates) => ({
      name: names[3], args: { adId: 'group-1', ...dates },
      expected: { adId: 'group-1', ...dates, market: 1, interval: 'week', keyword: '', orderField: 'updatedTime', desc: true },
    })),
  ])('sends complete protocol inputs for $name and rejects a malformed bridge response', async ({ name, args, expected }) => {
    const responsePromise = client.callTool({ name, arguments: args }, undefined, { timeout: 5000 })
    const poll = await post('/v1/bridge/poll')
    expect(poll.status).toBe(200)
    const pending = await poll.json() as { requestId: string; request: { requestId: string; payload: { targetId: string; input: unknown } } }
    const accepted = await post('/v1/bridge/result', { requestId: pending.requestId, response: {} })
    expect(accepted.status).toBe(200)
    const response = await responsePromise
    expect(isSellerSpriteAdsRequest(pending.request)).toBe(true)
    expect(pending.request.requestId).toBe(pending.requestId)
    expect(pending.request.payload.targetId).toBe('sellersprite')
    expect(pending.request.payload.input).toEqual(expected)
    expect(response).toMatchObject({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'INVALID_EXTENSION_RESPONSE' }) }] })
  })
})

describe('MCP output size', () => {
  it.each([
    { resultId: 'not-a-result-id' },
    { resultId: '00000000-0000-4000-8000-000000000000', offset: -1 },
    { resultId: '00000000-0000-4000-8000-000000000000', path: 'data.items' },
    { resultId: '00000000-0000-4000-8000-000000000000', limit: 0 },
    { resultId: '00000000-0000-4000-8000-000000000000', fields: [] },
    { resultId: '00000000-0000-4000-8000-000000000000', unknown: true },
  ])('rejects invalid cached-result arguments: %j', async (args) => {
    const response = await client.callTool({ name: 'sellersprite_read_result', arguments: args })
    expect(response.isError).toBe(true)
    expect(JSON.stringify(response.content)).toContain('Input validation error')
  })

  it('keeps a 230k-character keyword response readable and retrieves every row from the same result', async () => {
    const responsePromise = client.callTool({
      name: 'sellersprite_keyword_reverse', arguments: { asin: 'B0F9XY6HXB' },
    }, undefined, { timeout: 5000 })
    const poll = await post('/v1/bridge/poll')
    const pending = await poll.json() as { requestId: string; request: { namespace: string; protocolVersion: number } }
    const items = Array.from({ length: 50 }, (_, index) => keywordItem(index, 36))
    const original = {
      namespace: pending.request.namespace, protocolVersion: pending.request.protocolVersion,
      kind: 'response', requestId: pending.requestId, action: 'SELLERSPRITE_KEYWORD_REVERSE', ok: true,
      data: { asin: 'B0F9XY6HXB', total: 500, items },
    }
    expect(JSON.stringify(original, null, 2).length).toBeGreaterThan(230_000)
    expect((await post('/v1/bridge/result', { requestId: pending.requestId, response: original })).status).toBe(200)
    const response = CallToolResultSchema.parse(await responsePromise)
    expect(response.isError).not.toBe(true)
    expect(response.content[0]).toMatchObject({ type: 'text' })
    const firstText = (response.content[0] as { text: string }).text
    expect(firstText.length).toBeLessThanOrEqual(16_000)
    const first = JSON.parse(firstText)
    expect(first.resultId).toEqual(expect.any(String))
    expect(first.summary.data).toMatchObject({ asin: 'B0F9XY6HXB', total: 500 })
    expect(first.summary.data.items).toMatchObject({ type: 'array', length: 50 })
    const retrieved: unknown[] = []
    let offset = 0
    do {
      const page = CallToolResultSchema.parse(await client.callTool({
        name: 'sellersprite_read_result',
        arguments: { resultId: first.resultId, path: ['data', 'items'], offset, limit: 20 },
      }, undefined, { timeout: 3000 }))
      expect(page.isError).not.toBe(true)
      const text = (page.content[0] as { text: string }).text
      expect(text.length).toBeLessThanOrEqual(16_000)
      const parsed = JSON.parse(text)
      expect(parsed.total).toBe(50)
      expect(parsed.offset).toBe(offset)
      retrieved.push(...parsed.items)
      if (!parsed.hasMore) break
      expect(parsed.nextOffset).toBeGreaterThan(offset)
      offset = parsed.nextOffset
    } while (retrieved.length <= items.length)
    expect(retrieved).toEqual(items)
    const projected = CallToolResultSchema.parse(await client.callTool({
      name: 'sellersprite_read_result',
      arguments: { resultId: first.resultId, path: ['data', 'items'], fields: ['keywords', 'searches', 'ad'], limit: 50 },
    }))
    expect(projected.isError).not.toBe(true)
    const projection = JSON.parse((projected.content[0] as { text: string }).text)
    expect(projection.items).toHaveLength(50)
    expect(projection.items[0]).toEqual({ keywords: 'camping tent 0', searches: 1000, ad: null })
    const trend = CallToolResultSchema.parse(await client.callTool({
      name: 'sellersprite_read_result',
      arguments: { resultId: first.resultId, path: ['data', 'items', '0', 'searchesTrend'], limit: 100 },
    }))
    expect(trend.isError).not.toBe(true)
    expect(JSON.parse((trend.content[0] as { text: string }).text).items).toEqual(items[0].searchesTrend)
  }, 15000)
})

describe('MCP keyword query reuse', () => {
  it('reuses a keyword response for ad analysis without a second upstream request', async () => {
    const args = { asin: 'B0CACHE001' }
    const first = client.callTool({ name: 'sellersprite_keyword_reverse', arguments: args }, undefined, { timeout: 5000 })
    await answerKeywordQuery()
    expect((await first).isError).not.toBe(true)
    const analysis = await client.callTool({ name: 'sellersprite_asin_ad_analysis', arguments: args }, undefined, { timeout: 2000 })
    expect(analysis.isError).not.toBe(true)
    const content = CallToolResultSchema.parse(analysis).content[0] as { text: string }
    expect(JSON.parse(content.text)).toMatchObject({ cache: { hit: true }, analysis: { analyzedKeywords: 1, totalKeywords: 500 } })
  })
})
