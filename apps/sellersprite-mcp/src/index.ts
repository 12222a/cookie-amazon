import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  MARKET_SELECTION_ACTION, SELLERSPRITE_ABA_MARKETS, SELLERSPRITE_KEYWORD_REVERSE_ACTION,
  SELLERSPRITE_MARKET_RECENT_30_DAYS, createPingRequest, createSellerSpriteAbaPeriodsRequest,
  createSellerSpriteAbaResearchRequest, createSellerSpriteCategoryNodesRequest,
  createSellerSpriteAdsInsightsRequest, createSellerSpriteAdsHistoryRequest,
  createSellerSpriteAdsKeywordsRequest, createSellerSpriteAdsHighFrequencyRequest,
  createSellerSpriteCompetitorRequest, createSellerSpriteHtmlSessionRequest,
  createSellerSpriteKeywordMiningRequest,
  createSellerSpriteMarketResearchRequest, createSellerSpriteMonthlyRequest,
  createSellerSpriteProductSelectionRequest, createSellerSpriteReviewCommentsRequest,
  createTargetRequest, isPingResponse, isSellerSpriteAbaPeriodsResponse,
  isSellerSpriteAbaResearchResponse, isSellerSpriteCategoryNodesResponse,
  isSellerSpriteAdsInsightsResponse, isSellerSpriteAdsHistoryResponse,
  isSellerSpriteAdsKeywordsResponse, isSellerSpriteAdsHighFrequencyResponse, isSellerSpriteAdsDate,
  isSellerSpriteCompetitorResponse, isSellerSpriteHtmlSessionResponse,
  isSellerSpriteKeywordMiningResponse,
  isSellerSpriteMarketResearchResponse, isSellerSpriteMonthlyResponse,
  isSellerSpriteProductSelectionResponse, isSellerSpriteReviewCommentsResponse,
  isTargetResponse, type SellerSpriteAbaResearchInput, type SellerSpriteCompetitorInput,
  type SellerSpriteAdsInsightsInput, type SellerSpriteAdsHistoryInput,
  type SellerSpriteAdsKeywordsInput, type SellerSpriteAdsHighFrequencyInput,
  type SellerSpriteKeywordMiningInput, type SellerSpriteMarketResearchMonth,
  type SellerSpriteProductSelectionInput, type SellerSpriteReviewCommentsInput,
} from '@cookie-amazon/protocol'
import { z } from 'zod'
import { createBridgeServer } from './bridge.js'
import { analyzeSellerSpriteAsinAdStructure } from './ad-analysis.js'
import { createResultOutput } from './result-output.js'
import { createKeywordQuery } from './keyword-query.js'

const port = Number(process.env.SELLERSPRITE_MCP_PORT ?? '32123')
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SELLERSPRITE_MCP_PORT')
const bridge = createBridgeServer({ token: process.env.SELLERSPRITE_MCP_TOKEN ?? '' })
const server = new McpServer({ name: 'sellersprite-browser-session', version: '0.1.0' })
const targetId = 'sellersprite'
const queryKeywords = createKeywordQuery(bridge.enqueue, targetId)

const resultOutput = createResultOutput()
const result = resultOutput.format
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const register = <T extends z.ZodType>(
  name: string,
  title: string,
  description: string,
  schema: T,
  build: (input: z.output<T>, id: string) => unknown,
  validate: (value: unknown) => boolean,
): void => {
  server.registerTool<AnySchema, AnySchema>(name, { title, description, inputSchema: schema as AnySchema }, async (args: z.output<T>) => {
    const id = randomUUID()
    try {
      const response = await bridge.enqueue({ requestId: id, request: build(args as z.output<T>, id) })
      if (!validate(response) || !record(response) || response.requestId !== id) return result({ error: 'INVALID_EXTENSION_RESPONSE' }, true)
      return result(response, response.ok === false)
    } catch (error) {
      return result({ error: error instanceof Error ? error.message : 'BRIDGE_ERROR' }, true)
    }
  })
}

const none = z.object({}).strict()
const asin = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/)
const keyword = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9 &'/-]*$/)
const page = z.number().int().min(1).max(10000).default(1)
const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()])

server.registerTool<AnySchema, AnySchema>('sellersprite_read_result', {
  title: 'Read cached SellerSprite result',
  description: 'Read a large response cached by any SellerSprite tool, without another upstream request. Use path ["data", "items"] for keyword rows; fields selects direct row fields so trends can be read separately. Follow the returned nextOffset until hasMore is false; pages shrink to fit 16000 characters. Cache lasts 15 minutes, holds 8 large results, and clears on MCP restart. Cached row counts may be smaller than upstream total matches.',
  inputSchema: z.object({
    resultId: z.uuid(),
    path: z.array(z.string().min(1).max(128)).max(16).default([]),
    offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
    limit: z.number().int().min(1).max(20_000).optional().describe('Default 20 rows (maximum 100), or 12000 characters for strings. Actual pages may be smaller.'),
    fields: z.array(z.string().min(1).max(128)).min(1).max(40).optional(),
  }).strict() as AnySchema,
}, async (args: Parameters<typeof resultOutput.read>[0]) => resultOutput.read(args))

register('sellersprite_ping', 'Ping extension', 'Check whether the local SellerSprite extension bridge is online.', none,
  (_, id) => createPingRequest(id), isPingResponse)
register('sellersprite_status', 'SellerSprite status', 'Get extension status, permission, remote enablement, and effective capabilities.', none,
  (_, id) => createTargetRequest('GET_TARGET_STATUS', id, targetId), isTargetResponse)
register('sellersprite_check_login', 'Check login', 'Check the current SellerSprite browser login without returning cookie values.', none,
  (_, id) => createTargetRequest('CHECK_LOGIN', id, targetId), isTargetResponse)

const keywordReverseSchema = z.object({
  asin, month: z.string().max(32).default(''), forceReStat: z.boolean().default(false),
  badges: z.array(primitive).max(100).default([]), limit: z.number().int().min(1).max(100).default(50),
  refresh: z.boolean().default(false).describe('Bypass the local 120-second keyword cache without forcing an upstream recalculation.'),
}).strict()
const asinAdSchema = keywordReverseSchema.omit({ badges: true })

server.registerTool<AnySchema, AnySchema>('sellersprite_keyword_reverse', {
  title: 'Reverse ASIN keywords',
  description: 'Find indexed keywords for a US Amazon ASIN. Shares identical queries with sellersprite_asin_ad_analysis for up to 120 seconds, merging concurrent requests. Set refresh true to fetch again. For large results, use sellersprite_read_result with fields to read core metrics before trends.',
  inputSchema: keywordReverseSchema as AnySchema,
}, async (args: z.output<typeof keywordReverseSchema>) => {
  try {
    const { response, cache } = await queryKeywords({
      asin: args.asin, marketId: 1, month: args.month, forceReStat: args.forceReStat, badges: args.badges, limit: args.limit,
    }, args.refresh)
    return result({ ...response, cache }, response.ok === false)
  } catch (error) {
    return result({ error: error instanceof Error ? error.message : 'BRIDGE_ERROR' }, true)
  }
})

server.registerTool<AnySchema, AnySchema>('sellersprite_asin_ad_analysis', {
  title: 'ASIN ad structure analysis',
  description: 'Summarize ad and organic positions from SellerSprite ASIN keyword reverse data. Reuses identical keyword_reverse queries for up to 120 seconds; set refresh true to fetch again. This is not an ad campaign report and does not provide ACOS, CPC, or attributed sales.',
  inputSchema: asinAdSchema as AnySchema,
}, async (args: z.output<typeof asinAdSchema>) => {
  try {
    const { response, cache } = await queryKeywords({
      asin: args.asin, marketId: 1, month: args.month, forceReStat: args.forceReStat, badges: [], limit: args.limit,
    }, args.refresh)
    if (!response.ok) return result({ ...response, cache }, true)
    return result({ source: 'sellersprite_keyword_reverse', cache, analysis: analyzeSellerSpriteAsinAdStructure(response.data) })
  } catch (error) {
    return result({ error: error instanceof Error ? error.message : 'BRIDGE_ERROR' }, true)
  }
})

const adsAsin = z.string().length(10).regex(/^[A-Z0-9]{10}$/)
const adsText = /^(?![\s\S]*[\u0000-\u001F\u007F-\u009F])/
const adsId = z.string().max(128).regex(adsText)
const adsRequiredId = adsId.refine((value) => value.trim().length > 0, 'adId must not be blank')
const adsWindowFields = {
  asin: adsAsin,
  market: z.union([z.literal(1), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7),
    z.literal(35691), z.literal(44551), z.literal(44571)]).default(1),
  interval: z.enum(['week', 'month']).default('week'),
  months: z.union([z.literal(3), z.literal(6), z.literal(12), z.literal(24)]).default(6),
}
const adsWindowValid = (input: { interval: string; months: number }): boolean =>
  input.interval !== 'week' || input.months !== 24
const adsWindowError = { path: ['months'], message: '24 months requires interval month' }
const adsInsightsSchema = z.object({
  ...adsWindowFields, desc: z.boolean().default(false), pageNum: page,
  pageSize: z.number().int().min(1).max(50).default(20),
  orderByEffectiveness: z.boolean().default(false),
  type: z.enum(['', 'SP', 'SPV']).default('').describe('SPV is the web API value for Sponsored Brands Video (SBV).'),
  campaignId: adsId.default(''), adId: adsId.default(''),
  variation: z.union([z.literal(''), adsAsin]).default(''),
  combination: z.boolean().default(false), brief: z.boolean().default(false),
}).strict().refine(adsWindowValid, adsWindowError)
const adsHistorySchema = z.object({
  ...adsWindowFields, adId: adsRequiredId,
}).strict().refine(adsWindowValid, adsWindowError)
const adsDate = z.union([
  z.number().int().nonnegative(),
  z.string().min(1).max(40).regex(adsText),
]).refine(isSellerSpriteAdsDate, 'Use YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, an ISO datetime, or 8 to 13 digits')
const adsDateValue = (value: number | string): number =>
  typeof value === 'number' || /^\d{8,13}$/.test(value) ? Number(value) : Date.parse(value.replace(' ', 'T'))
const adsDatesOrdered = (input: { beginDate: number | string; endDate: number | string }): boolean => {
  const begin = adsDateValue(input.beginDate)
  const end = adsDateValue(input.endDate)
  return !Number.isFinite(begin) || !Number.isFinite(end) || begin <= end
}
const adsDateError = { path: ['endDate'], message: 'endDate must not precede beginDate' }
const adsKeywordFields = {
  adId: adsRequiredId, market: adsWindowFields.market, interval: adsWindowFields.interval,
  beginDate: adsDate, endDate: adsDate,
  keyword: z.string().max(256).regex(adsText).default(''),
  orderField: z.enum(['keyword', 'updatedTime']).default('updatedTime'), desc: z.boolean().default(true),
}
const adsKeywordsSchema = z.object({
  ...adsKeywordFields, pageNum: page, pageSize: z.number().int().min(1).max(50).default(50),
}).strict().refine(adsDatesOrdered, adsDateError)
const adsHighFrequencySchema = z.object(adsKeywordFields).strict().refine(adsDatesOrdered, adsDateError)
const adsDisclaimer = 'SellerSprite third-party inferred competitor advertising data, not a seller backend report; does not provide real budgets, CPC, or ACOS.'

register('sellersprite_ads_insights', 'Competitor advertising insights',
  'Read inferred competitor campaigns and ad group architecture. SPV means SBV in the web API. ' + adsDisclaimer, adsInsightsSchema,
  (v, id) => createSellerSpriteAdsInsightsRequest(id, targetId, {
    asin: v.asin, market: v.market, interval: v.interval, months: v.months, desc: v.desc,
    pageNum: v.pageNum, pageSize: v.pageSize, orderByEffectiveness: v.orderByEffectiveness,
    type: v.type, campaignId: v.campaignId, adId: v.adId, variation: v.variation,
    combination: v.combination, brief: v.brief,
  } satisfies SellerSpriteAdsInsightsInput), isSellerSpriteAdsInsightsResponse)
register('sellersprite_ads_history', 'Competitor advertising history',
  'Read available historical periods for an inferred competitor ad group. ' + adsDisclaimer, adsHistorySchema,
  (v, id) => createSellerSpriteAdsHistoryRequest(id, targetId, {
    asin: v.asin, market: v.market, interval: v.interval, months: v.months, adId: v.adId,
  } satisfies SellerSpriteAdsHistoryInput), isSellerSpriteAdsHistoryResponse)
register('sellersprite_ads_keywords', 'Competitor advertising keywords',
  'Read inferred competitor ad group keywords within a historical period. ' + adsDisclaimer, adsKeywordsSchema,
  (v, id) => createSellerSpriteAdsKeywordsRequest(id, targetId, {
    adId: v.adId, market: v.market, interval: v.interval, beginDate: v.beginDate, endDate: v.endDate,
    pageNum: v.pageNum, pageSize: v.pageSize, keyword: v.keyword, orderField: v.orderField, desc: v.desc,
  } satisfies SellerSpriteAdsKeywordsInput), isSellerSpriteAdsKeywordsResponse)
register('sellersprite_ads_high_frequency', 'Competitor advertising high-frequency terms',
  'Read high-frequency terms from inferred competitor ad group keywords within a historical period; no pagination. ' + adsDisclaimer, adsHighFrequencySchema,
  (v, id) => createSellerSpriteAdsHighFrequencyRequest(id, targetId, {
    adId: v.adId, market: v.market, interval: v.interval, beginDate: v.beginDate, endDate: v.endDate,
    keyword: v.keyword, orderField: v.orderField, desc: v.desc,
  } satisfies SellerSpriteAdsHighFrequencyInput), isSellerSpriteAdsHighFrequencyResponse)

register('sellersprite_monthly', 'Monthly ASIN data', 'Read SellerSprite monthly listing data for a US ASIN.', z.object({
  asin, month: z.string().max(32).default(''),
}).strict(), (input, id) => createSellerSpriteMonthlyRequest(id, targetId, {
  asin: input.asin, month: input.month, station: 'US',
}), isSellerSpriteMonthlyResponse)

const monthOptions = (): string[] => {
  const now = new Date()
  return [SELLERSPRITE_MARKET_RECENT_30_DAYS, ...Array.from({ length: 13 }, (_, i) => {
    const month = new Date(now.getFullYear(), now.getMonth() - i - 1, 1)
    return 'bsr_sales_monthly_' + month.getFullYear() + String(month.getMonth() + 1).padStart(2, '0')
  })]
}
register('sellersprite_market_research', 'Market research', 'Summarize recent US marketplace data for a product keyword.', z.object({
  keyword, monthName: z.string().default(SELLERSPRITE_MARKET_RECENT_30_DAYS).refine((v) => monthOptions().includes(v)),
  newReleaseNum: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).default(6),
}).strict(), (input, id) => createSellerSpriteMarketResearchRequest(id, targetId, {
  marketId: 1, departmentKeyword: input.keyword,
  monthName: input.monthName as SellerSpriteMarketResearchMonth, newReleaseNum: input.newReleaseNum,
}), isSellerSpriteMarketResearchResponse)

register('sellersprite_aba_periods', 'List ABA periods', 'List available weekly and monthly Amazon Brand Analytics periods.', none,
  (_, id) => createSellerSpriteAbaPeriodsRequest(id, targetId), isSellerSpriteAbaPeriodsResponse)
const abaSchema = z.object({
  reverseType: z.enum(['W', 'M']), table: z.string().regex(/^ara_\d{6}(?:\d{2})?$/),
  keyword: z.string().trim().min(1).max(256), market: z.enum(SELLERSPRITE_ABA_MARKETS).default('COM'),
  page, size: z.number().int().min(1).max(50).default(50),
}).strict().superRefine((input, ctx) => {
  if (!(input.reverseType === 'W' ? /^ara_\d{8}$/ : /^ara_\d{6}$/).test(input.table)) {
    ctx.addIssue({ code: 'custom', path: ['table'], message: 'table format must match reverseType' })
  }
})
register('sellersprite_aba_research', 'ABA keyword research', 'Query Brand Analytics search terms for a period, keyword, and marketplace.', abaSchema,
  (input, id) => createSellerSpriteAbaResearchRequest(id, targetId, {
    reverseType: input.reverseType, table: input.table, q: input.keyword, market: input.market, page: input.page, size: input.size,
  } satisfies SellerSpriteAbaResearchInput), isSellerSpriteAbaResearchResponse)

const competitorSchema = z.object({
  asins: z.array(z.string().trim().min(1).max(16)).max(100).default([]),
  keyword: z.string().trim().max(80).default(''), brand: z.string().trim().max(128).default(''), seller: z.string().trim().max(128).default(''),
  lowPrice: z.enum(['Y', 'N']).default('N'), market: z.string().max(32).default('US'),
  monthName: z.string().max(32).default(SELLERSPRITE_MARKET_RECENT_30_DAYS),
  nodeIdPaths: z.array(primitive).max(100).default([]), orderField: z.string().min(1).max(64).default('total_units'),
  desc: z.boolean().default(true), page, size: z.number().int().min(1).max(60).default(50), symbolFlag: z.boolean().default(false),
}).strict().refine((v) => [v.asins.length > 0, v.keyword.length > 0, v.brand.length > 0, v.seller.length > 0].filter(Boolean).length === 1,
  'Provide exactly one selector: ASINs, keyword, brand, or seller.')
register('sellersprite_competitor_research', 'Competitor research', 'Search competitor listings using exactly one selector: ASINs, keyword, brand, or seller.', competitorSchema,
  (v, id) => createSellerSpriteCompetitorRequest(id, targetId, {
    asins: v.asins, keywords: v.keyword, brand: v.brand, seller: v.seller, lowPrice: v.lowPrice,
    market: v.market, monthName: v.monthName, nodeIdPaths: v.nodeIdPaths,
    order: { desc: v.desc, field: v.orderField }, page: v.page, size: v.size, symbolFlag: v.symbolFlag,
  } satisfies SellerSpriteCompetitorInput), isSellerSpriteCompetitorResponse)

const productSchema = z.object({
  nodeIdPaths: z.array(z.string().regex(/^\d+(?::\d+)+$/)).min(1).max(100), market: z.string().max(32).default('US'),
  monthName: z.string().max(32).default(SELLERSPRITE_MARKET_RECENT_30_DAYS), page,
  size: z.number().int().min(1).max(100).default(50), minRanking: z.string().max(32).default(''),
  maxRanking: z.string().max(32).default(''), maxSales: z.string().max(32).default(''), maxPrice: z.string().max(32).default(''),
  maxSellers: z.string().max(32).default(''), lowPrice: z.enum(['Y', 'N']).default('N'),
  orderField: z.string().min(1).max(64).default('total_units'), desc: z.boolean().default(true),
}).strict()
register('sellersprite_product_selection', 'Product selection', 'Filter products by a leaf category path. Use sellersprite_category_nodes to discover leaf paths.', productSchema,
  (v, id) => {
    const input: SellerSpriteProductSelectionInput = {
      eligibility: [], filterSub: false, lowPrice: v.lowPrice, market: v.market, maxPrice: v.maxPrice,
      maxRanking: v.maxRanking, maxSales: v.maxSales, maxSellers: v.maxSellers, minRanking: v.minRanking,
      monthName: v.monthName, nodeIdPaths: v.nodeIdPaths, order: { desc: v.desc, field: v.orderField },
      page: v.page, pkgDimensionTypeList: [], productTags: [], selectType: '2', sellerNationList: [], sellerTypes: [],
      size: v.size, symbolFlag: false, weightUnit: 'g',
    }
    return createSellerSpriteProductSelectionRequest(id, targetId, input)
  }, isSellerSpriteProductSelectionResponse)

register('sellersprite_category_nodes', 'List category nodes', 'Browse category nodes. Provide a parent path to list child categories.', z.object({
  marketId: z.number().int().min(1).max(1000).default(1), nodeIdPath: z.string().regex(/^\d+(?::\d+)*$/).optional(),
}).strict(), (v, id) => createSellerSpriteCategoryNodesRequest(id, targetId, {
  marketld: v.marketId, table: SELLERSPRITE_MARKET_RECENT_30_DAYS, ...(v.nodeIdPath ? { nodeIdPath: v.nodeIdPath } : {}),
}), isSellerSpriteCategoryNodesResponse)

register('sellersprite_review_comments', 'Read review comments', 'Read review comments for a US Amazon ASIN.', z.object({
  asin, pageNum: page, pageSize: z.number().int().min(1).max(50).default(50),
}).strict(), (v, id) => createSellerSpriteReviewCommentsRequest(id, targetId, {
  asin: v.asin, keyword: '', market: 'US', pageNum: v.pageNum, pageSize: v.pageSize,
  reviewEndTime: null, reviewStartTime: null, order: { fieldName: 'date', sort: 1 }, starList: [], typeList: [], variations: [],
} satisfies SellerSpriteReviewCommentsInput), isSellerSpriteReviewCommentsResponse)

register('sellersprite_keyword_mining', 'Mine related keywords', 'Find related US marketplace keywords and search metrics.', z.object({
  keyword, pageNum: page, pageSize: z.number().int().min(1).max(100).default(50),
}).strict(), (v, id) => createSellerSpriteKeywordMiningRequest(id, targetId, {
  keyword: v.keyword, market: 1, pageNum: v.pageNum, pageSize: v.pageSize, historyDate: '',
  orderBy: 21, desc: true, filterRootWord: 0, matchType: 0, amazonChoice: false, keywordBidMatchType: 'exact',
} satisfies SellerSpriteKeywordMiningInput), isSellerSpriteKeywordMiningResponse)

register('sellersprite_open_market_selection', 'Open market selection', 'Open the market selection page; only completion status is returned.', none,
  (_, id) => createSellerSpriteHtmlSessionRequest(MARKET_SELECTION_ACTION, id, targetId), isSellerSpriteHtmlSessionResponse)
register('sellersprite_open_keyword_research', 'Open keyword product research', 'Open the keyword research page; only completion status is returned.', none,
  (_, id) => createSellerSpriteHtmlSessionRequest('KEYWORD_PRODUCT_RESEARCH', id, targetId), isSellerSpriteHtmlSessionResponse)

const start = async (): Promise<void> => {
  await bridge.listen(port)
  await server.connect(new StdioServerTransport())
  console.error('SellerSprite MCP bridge listening on 127.0.0.1:' + port)
}
void start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
  void bridge.close()
})
const shutdown = async (): Promise<void> => { await server.close(); await bridge.close() }
process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)) })
process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)) })
