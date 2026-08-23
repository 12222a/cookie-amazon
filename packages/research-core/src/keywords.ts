import type { AggregatedKeyword, CandidateTier, KeywordMetric } from './model'

const finite = (value: number | null | undefined): number | null =>
  value !== null && value !== undefined && Number.isFinite(value) ? value : null

const maxNullable = (values: Array<number | null | undefined>): number | null => {
  const valid = values.map(finite).filter((value): value is number => value !== null)
  return valid.length === 0 ? null : Math.max(...valid)
}

const minNullable = (values: Array<number | null | undefined>): number | null => {
  const valid = values.map(finite).filter((value): value is number => value !== null)
  return valid.length === 0 ? null : Math.min(...valid)
}

export const normalizeKeyword = (value: string): string => value
  .normalize('NFKC')
  .toLocaleLowerCase('en-US')
  .replace(/[\u2018\u2019'"`]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const containsBrandTerm = (normalized: string, brandTerms: readonly string[]): boolean => {
  const padded = ` ${normalized} `
  return brandTerms
    .map(normalizeKeyword)
    .filter(Boolean)
    .some((term) => padded.includes(` ${term} `))
}

const classifyKeyword = (normalized: string, isBrand: boolean, sourceCount: number): AggregatedKeyword['kind'] => {
  if (isBrand) return 'brand'
  const tokens = normalized.split(' ').filter(Boolean)
  if (/\b(for|with|without|replacement|compatible|gift|travel|outdoor|office|kids|women|men)\b/.test(normalized)) return 'intent'
  if (/\b(size|small|large|mini|portable|adjustable|waterproof|wireless|metal|wood|cotton|pack|inch|color)\b/.test(normalized)) return 'attribute'
  if (tokens.length <= 3 && sourceCount >= 2) return 'core'
  return tokens.length >= 4 ? 'intent' : 'other'
}

const keywordScore = (keyword: Omit<AggregatedKeyword, 'score' | 'kind'>): number => {
  const signals: number[] = []
  signals.push(Math.min(1, keyword.sourceCount / 3))
  if (keyword.searchVolume !== null) signals.push(Math.min(1, Math.log10(keyword.searchVolume + 1) / 5))
  if (keyword.purchaseRate !== null) signals.push(Math.min(1, keyword.purchaseRate / 0.2))
  if (keyword.supplyDemandRatio !== null) signals.push(1 / (1 + Math.max(0, keyword.supplyDemandRatio)))
  if (keyword.relevancy !== null) signals.push(Math.min(1, Math.max(0, keyword.relevancy)))
  if (keyword.rank !== null) signals.push(1 / (1 + Math.max(0, keyword.rank) / 20))
  const average = signals.length === 0 ? 0 : signals.reduce((sum, value) => sum + value, 0) / signals.length
  return Math.round(Math.max(0, Math.min(100, average * 100 - (keyword.isBrandTerm ? 30 : 0))))
}

export const aggregateKeywords = (
  values: readonly KeywordMetric[],
  brandTerms: readonly string[] = [],
): AggregatedKeyword[] => {
  const groups = new Map<string, KeywordMetric[]>()
  for (const value of values) {
    const normalized = normalizeKeyword(value.keyword)
    if (!normalized) continue
    const group = groups.get(normalized) ?? []
    group.push(value)
    groups.set(normalized, group)
  }
  return [...groups.entries()].map(([normalized, group]) => {
    const sourceAsins = [...new Set(group.flatMap((item) => item.sourceAsins ?? []))]
    const sourceTiers = [...new Set(group.flatMap((item) => item.sourceTiers ?? []))] as CandidateTier[]
    const isBrandTerm = group.some((item) => item.isBrandTerm === true) || containsBrandTerm(normalized, brandTerms)
    const base = {
      keyword: group[0]?.keyword.trim() ?? normalized,
      normalized,
      searchVolume: maxNullable(group.map((item) => item.searchVolume)),
      purchaseRate: maxNullable(group.map((item) => item.purchaseRate)),
      supplyDemandRatio: minNullable(group.map((item) => item.supplyDemandRatio)),
      relevancy: maxNullable(group.map((item) => item.relevancy)),
      rank: minNullable(group.map((item) => item.rank)),
      products: maxNullable(group.map((item) => item.products)),
      sourceAsins,
      sourceTiers,
      departments: [...new Set(group.flatMap((item) => item.departments ?? []))],
      isBrandTerm,
      sourceCount: sourceAsins.length || group.length,
    }
    return {
      ...base,
      score: keywordScore(base),
      kind: classifyKeyword(normalized, isBrandTerm, base.sourceCount),
    }
  }).sort((left, right) => right.score - left.score || (right.searchVolume ?? 0) - (left.searchVolume ?? 0))
}

const tokenSimilarity = (left: string, right: string): number => {
  const a = new Set(left.split(' '))
  const b = new Set(right.split(' '))
  const union = new Set([...a, ...b])
  if (union.size === 0) return 1
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection += 1
  return intersection / union.size
}

export const selectSeedKeywords = (
  keywords: readonly AggregatedKeyword[],
  limit = 3,
): AggregatedKeyword[] => {
  const candidates = keywords.filter((item) => !item.isBrandTerm)
  const selected: AggregatedKeyword[] = []
  const preferredKinds: AggregatedKeyword['kind'][] = ['core', 'intent', 'attribute', 'other']
  for (const kind of preferredKinds) {
    const match = candidates.find((item) => item.kind === kind
      && selected.every((chosen) => tokenSimilarity(chosen.normalized, item.normalized) < 0.8))
    if (match) selected.push(match)
    if (selected.length >= limit) return selected
  }
  for (const candidate of candidates) {
    if (selected.includes(candidate)) continue
    if (selected.every((chosen) => tokenSimilarity(chosen.normalized, candidate.normalized) < 0.8)) selected.push(candidate)
    if (selected.length >= limit) break
  }
  return selected
}

export const selectAbaKeywords = (keywords: readonly AggregatedKeyword[], limit = 5): AggregatedKeyword[] =>
  selectDiverseKeywords(keywords.filter((item) => !item.isBrandTerm), limit)

export const selectRepresentativeKeywords = (keywords: readonly AggregatedKeyword[], limit = 3): AggregatedKeyword[] =>
  selectDiverseKeywords(keywords.filter((item) => !item.isBrandTerm), limit)

const selectDiverseKeywords = (keywords: readonly AggregatedKeyword[], limit: number): AggregatedKeyword[] => {
  const selected: AggregatedKeyword[] = []
  for (const keyword of keywords) {
    if (selected.every((chosen) => tokenSimilarity(chosen.normalized, keyword.normalized) < 0.85)) selected.push(keyword)
    if (selected.length >= limit) break
  }
  return selected
}