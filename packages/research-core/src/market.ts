import type { CompetitorEvidence, MarketEvidence } from './model'

const average = (values: Array<number | null | undefined>): number | null => {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  return valid.length === 0 ? null : valid.reduce((sum, value) => sum + value, 0) / valid.length
}

export interface MarketStructureSummary {
  keywordCount: number
  products: number | null
  monthlySales: number | null
  top10SalesConcentration: number | null
  brandConcentration: number | null
  sellerConcentration: number | null
  fbaShare: number | null
  amazonShare: number | null
  fbmShare: number | null
  medianReviews: number | null
  medianListingAgeDays: number | null
  newProductShare: number | null
  coverage: number
  extremeConcentration: boolean
}

export const summarizeMarketStructure = (
  markets: readonly MarketEvidence[],
  competitors: readonly CompetitorEvidence[],
): MarketStructureSummary => {
  const top10SalesConcentration = average(competitors.map((item) => item.top10SalesConcentration))
  const brandConcentration = average(markets.map((item) => item.brandConcentration))
  const sellerConcentration = average(markets.map((item) => item.sellerConcentration))
  const signals = [
    markets.length > 0,
    competitors.length > 0,
    top10SalesConcentration !== null,
    brandConcentration !== null,
    sellerConcentration !== null,
    average(competitors.map((item) => item.medianReviews)) !== null,
    average(markets.map((item) => item.newProductShare)) !== null,
  ]

  return {
    keywordCount: new Set([...markets.map((item) => item.keyword), ...competitors.map((item) => item.keyword)]).size,
    products: average(markets.map((item) => item.totalProducts)),
    monthlySales: average(markets.map((item) => item.totalSales)),
    top10SalesConcentration,
    brandConcentration,
    sellerConcentration,
    fbaShare: average(markets.map((item) => item.fbaRatio)),
    amazonShare: average(markets.map((item) => item.amzRatio)),
    fbmShare: average(markets.map((item) => item.fbmRatio)),
    medianReviews: average(competitors.map((item) => item.medianReviews)),
    medianListingAgeDays: average(competitors.map((item) => item.medianListingAgeDays)),
    newProductShare: average([
      ...markets.map((item) => item.newProductShare),
      ...competitors.map((item) => item.newListingShare),
    ]),
    coverage: signals.filter(Boolean).length / signals.length,
    extremeConcentration: (top10SalesConcentration ?? 0) >= 0.75
      || (brandConcentration ?? 0) >= 0.7
      || (sellerConcentration ?? 0) >= 0.7,
  }
}