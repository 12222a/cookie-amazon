import type {
  SellerSpriteCompetitorData,
  SellerSpriteMonthlyData,
  SellerSpriteMonthlyInput,
  SellerSpriteMonthlyVariation,
} from '@cookie-amazon/protocol'
import { readSellerSpriteMonthly } from '@cookie-amazon/web-sdk'
import { selectResearchAsins } from './asin-candidates'
import { buildMonthlyInput } from './input'

export type MonthlyFieldCoverage = {
  price: number
  rating: number
  reviews: number
  listingAge: number
  bsr: number
}

export type MonthlyLookupState = {
  status: 'idle' | 'loading' | 'complete' | 'partial' | 'unavailable' | 'unsupported-market'
  market: string | null
  attemptedAsinCount: number
  successfulAsinCount: number
  fieldCoverage: MonthlyFieldCoverage
}

export type AsinMonthlyEvidence = {
  asin: string
  variation: SellerSpriteMonthlyVariation
}

export type MonthlyLookupResult = {
  state: MonthlyLookupState
  evidence: readonly AsinMonthlyEvidence[]
}

type ReadMonthly = (
  input: SellerSpriteMonthlyInput,
  options: { timeoutMs: number },
) => Promise<SellerSpriteMonthlyData>

const EMPTY_FIELD_COVERAGE: MonthlyFieldCoverage = {
  price: 0, rating: 0, reviews: 0, listingAge: 0, bsr: 0,
}

export const EMPTY_MONTHLY_LOOKUP: MonthlyLookupState = {
  status: 'idle', market: null, attemptedAsinCount: 0, successfulAsinCount: 0,
  fieldCoverage: EMPTY_FIELD_COVERAGE,
}

const fieldCoverageOf = (
  evidence: readonly AsinMonthlyEvidence[],
  attemptedAsinCount: number,
): MonthlyFieldCoverage => {
  if (attemptedAsinCount === 0) return EMPTY_FIELD_COVERAGE
  const ratio = (predicate: (variation: SellerSpriteMonthlyVariation) => boolean): number =>
    evidence.filter(({ variation }) => predicate(variation)).length / attemptedAsinCount
  return {
    price: ratio((variation) => variation.price !== null),
    rating: ratio((variation) => variation.rating !== null),
    reviews: ratio((variation) => variation.reviews !== null),
    listingAge: ratio((variation) => variation.availableDays !== null || variation.availableDate !== null),
    bsr: ratio((variation) => variation.bsrRank !== null),
  }
}

const selectVariation = (asin: string, data: SellerSpriteMonthlyData): SellerSpriteMonthlyVariation | null =>
  data.variations.find((variation) => variation.asin === asin) ?? data.variations[0] ?? null

export const prepareMonthlyLookup = (
  data: SellerSpriteCompetitorData,
  market: string,
  readMonthly: ReadMonthly = readSellerSpriteMonthly,
): { initialState: MonthlyLookupState; run: () => Promise<MonthlyLookupResult> } => {
  if (market !== 'US') {
    const state: MonthlyLookupState = {
      status: 'unsupported-market', market, attemptedAsinCount: 0, successfulAsinCount: 0,
      fieldCoverage: EMPTY_FIELD_COVERAGE,
    }
    return { initialState: state, run: async () => ({ state, evidence: [] }) }
  }

  const candidates = selectResearchAsins(data)
  if (candidates.length === 0) {
    const state: MonthlyLookupState = {
      status: 'unavailable', market, attemptedAsinCount: 0, successfulAsinCount: 0,
      fieldCoverage: EMPTY_FIELD_COVERAGE,
    }
    return { initialState: state, run: async () => ({ state, evidence: [] }) }
  }

  const initialState: MonthlyLookupState = {
    status: 'loading', market, attemptedAsinCount: candidates.length, successfulAsinCount: 0,
    fieldCoverage: EMPTY_FIELD_COVERAGE,
  }
  return {
    initialState,
    run: async () => {
      const evidence: AsinMonthlyEvidence[] = []
      for (const asin of candidates) {
        try {
          const data = await readMonthly(buildMonthlyInput(asin, market), { timeoutMs: 20_000 })
          const variation = selectVariation(asin, data)
          if (variation !== null) evidence.push({ asin, variation })
        } catch {
          // Static competitor data remains valid when monthly enrichment is unavailable.
        }
      }
      return {
        state: {
          status: evidence.length === candidates.length ? 'complete' : evidence.length > 0 ? 'partial' : 'unavailable',
          market,
          attemptedAsinCount: candidates.length,
          successfulAsinCount: evidence.length,
          fieldCoverage: fieldCoverageOf(evidence, candidates.length),
        },
        evidence,
      }
    },
  }
}

export const mergeMonthlyEvidence = (
  products: readonly import('@cookie-amazon/analytics').ProductObservation[],
  evidence: readonly AsinMonthlyEvidence[],
): import('@cookie-amazon/analytics').ProductObservation[] => {
  const byAsin = new Map(evidence.map((item) => [item.asin, item.variation]))
  return products.map((product) => {
    const monthly = byAsin.get(product.asin)
    if (!monthly) return { ...product, monthlyDataStatus: 'not-requested' }
    return {
      ...product,
      price: monthly.price ?? product.price,
      rating: monthly.rating ?? product.rating,
      reviews: monthly.reviews ?? product.reviews,
      availableDate: monthly.availableDate ?? product.availableDate,
      availableDays: monthly.availableDays ?? product.availableDays,
      bsrLabel: monthly.bsrLabel,
      bsrRank: monthly.bsrRank,
      monthlyDataStatus: 'available',
    }
  })
}