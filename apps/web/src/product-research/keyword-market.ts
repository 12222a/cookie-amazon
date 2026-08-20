import type {
  SellerSpriteKeywordItem,
  SellerSpriteKeywordReverseData,
} from '@cookie-amazon/protocol'

export type AsinKeywordEvidence = {
  asin: string
  data: SellerSpriteKeywordReverseData
}

export type KeywordNiche = {
  id: string
  label: string
  keywords: readonly string[]
  keywordCount: number
  searchVolume: number | null
  asinCoverage: number
}

export type KeywordMarketReport = {
  analyzedAsinCount: number
  availableKeywordCount: number
  sampledKeywordCount: number
  uniqueKeywordCount: number
  uniqueSearchVolume: number | null
  medianSupplyDemandRatio: number | null
  medianPurchaseRate: number | null
  searchTrendGrowth: number | null
  maximumTrendMonths: number
  demandScore: number | null
  demandConfidence: number
  niches: readonly KeywordNiche[]
}

type MergedKeyword = SellerSpriteKeywordItem & {
  asins: Set<string>
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with',
  'amazon', 'best', 'new', 'pack', 'set', 'women', 'woman', 'men', 'man',
])

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const scale = (value: number, low: number, high: number): number =>
  low === high ? 50 : clamp(((value - low) / (high - low)) * 100, 0, 100)

const logScale = (value: number, low: number, high: number): number =>
  scale(Math.log10(value + 1), Math.log10(low + 1), Math.log10(high + 1))

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

const weightedAverage = (components: readonly { value: number | null; weight: number }[]): number | null => {
  const available = components.filter((component) => component.value !== null)
  if (available.length === 0) return null
  const totalWeight = available.reduce((sum, component) => sum + component.weight, 0)
  return Math.round(available.reduce((sum, component) => sum + component.value! * component.weight, 0) / totalWeight)
}

const tokenize = (keyword: string): string[] => [...new Set(keyword
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, ' ')
  .split(/[\s-]+/)
  .map((token) => token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token)
  .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)))]

const trendGrowthOf = (item: SellerSpriteKeywordItem): number | null => {
  const values = (item.searchesTrend ?? [])
    .map((point) => point.searches)
    .filter((value): value is number => value !== null)
  if (values.length < 6) return null
  const latest = values.slice(-3)
  const previous = values.slice(-6, -3)
  const latestAverage = latest.reduce((sum, value) => sum + value, 0) / latest.length
  const previousAverage = previous.reduce((sum, value) => sum + value, 0) / previous.length
  return previousAverage === 0 ? null : (latestAverage - previousAverage) / previousAverage
}

const mergeKeywordEvidence = (evidence: readonly AsinKeywordEvidence[]): MergedKeyword[] => {
  const merged = new Map<string, MergedKeyword>()
  for (const entry of evidence) {
    for (const item of entry.data.items) {
      const key = item.keywords.trim().toLowerCase()
      if (key.length === 0) continue
      const current = merged.get(key)
      if (!current) {
        merged.set(key, { ...item, asins: new Set([entry.asin]) })
        continue
      }
      current.asins.add(entry.asin)
      if ((item.searches ?? -1) > (current.searches ?? -1)) {
        merged.set(key, { ...item, asins: current.asins })
      }
    }
  }
  return [...merged.values()]
}

const related = (left: readonly string[], right: readonly string[]): boolean => {
  const shared = left.filter((token) => right.includes(token)).length
  const union = new Set([...left, ...right]).size
  return shared >= 2 || (shared >= 1 && union > 0 && shared / union >= 0.2)
}

const nicheLabel = (items: readonly MergedKeyword[]): string => {
  const frequency = new Map<string, number>()
  for (const item of items) {
    for (const token of tokenize(item.keywords)) frequency.set(token, (frequency.get(token) ?? 0) + 1)
  }
  const tokens = [...frequency.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 2)
    .map(([token]) => token)
  return tokens.join(' · ') || items[0]?.keywords || '未命名关键词簇'
}

const buildNiches = (items: readonly MergedKeyword[]): KeywordNiche[] => {
  const clusters: MergedKeyword[][] = []
  for (const item of [...items].sort((left, right) => (right.searches ?? 0) - (left.searches ?? 0))) {
    const tokens = tokenize(item.keywords)
    const cluster = clusters.find((candidate) => candidate.some((entry) => related(tokens, tokenize(entry.keywords))))
    if (cluster) cluster.push(item)
    else clusters.push([item])
  }
  return clusters
    .map((cluster, index) => {
      const searches = cluster.map((item) => item.searches).filter((value): value is number => value !== null)
      return {
        id: `niche-${index + 1}`,
        label: nicheLabel(cluster),
        keywords: cluster.slice(0, 5).map((item) => item.keywords),
        keywordCount: cluster.length,
        searchVolume: searches.length === 0 ? null : searches.reduce((sum, value) => sum + value, 0),
        asinCoverage: new Set(cluster.flatMap((item) => [...item.asins])).size,
      }
    })
    .sort((left, right) => (right.searchVolume ?? 0) - (left.searchVolume ?? 0))
    .slice(0, 6)
}

export const buildKeywordMarketReport = (
  evidence: readonly AsinKeywordEvidence[],
): KeywordMarketReport => {
  const items = mergeKeywordEvidence(evidence)
  const searches = items.map((item) => item.searches).filter((value): value is number => value !== null)
  const ratios = items.map((item) => item.supplyDemandRatio).filter((value): value is number => value !== null)
  const purchaseRates = items.map((item) => item.purchaseRate).filter((value): value is number => value !== null)
  const trendGrowth = median(items.map(trendGrowthOf).filter((value): value is number => value !== null))
  const uniqueSearchVolume = searches.length === 0 ? null : searches.reduce((sum, value) => sum + value, 0)
  const demandScore = weightedAverage([
    { value: uniqueSearchVolume === null ? null : logScale(uniqueSearchVolume, 10_000, 5_000_000), weight: 0.5 },
    { value: trendGrowth === null ? null : scale(trendGrowth, -0.3, 0.5), weight: 0.25 },
    { value: purchaseRates.length === 0 ? null : scale(median(purchaseRates)!, 0.005, 0.12), weight: 0.25 },
  ])
  const availableKeywordCount = evidence.reduce((sum, entry) => sum + entry.data.total, 0)
  const fieldCoverage = items.length === 0 ? 0 : [searches.length, ratios.length, purchaseRates.length]
    .reduce((sum, count) => sum + count / items.length, 0) / 3
  const trendCoverage = items.length === 0 ? 0 : items.filter((item) => trendGrowthOf(item) !== null).length / items.length

  return {
    analyzedAsinCount: evidence.length,
    availableKeywordCount,
    sampledKeywordCount: evidence.reduce((sum, entry) => sum + entry.data.items.length, 0),
    uniqueKeywordCount: items.length,
    uniqueSearchVolume,
    medianSupplyDemandRatio: median(ratios),
    medianPurchaseRate: median(purchaseRates),
    searchTrendGrowth: trendGrowth,
    maximumTrendMonths: items.reduce((maximum, item) => Math.max(maximum, item.searchesTrend?.length ?? 0), 0),
    demandScore,
    demandConfidence: clamp((fieldCoverage * 0.65 + trendCoverage * 0.35) * Math.min(evidence.length / 3, 1), 0, 1),
    niches: buildNiches(items),
  }
}