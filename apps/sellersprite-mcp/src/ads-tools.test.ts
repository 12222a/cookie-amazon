import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { isSellerSpriteAdsRequest } from '@cookie-amazon/protocol'
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
    expect(response).toMatchObject({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'INVALID_EXTENSION_RESPONSE' }, null, 2) }] })
  })
})
