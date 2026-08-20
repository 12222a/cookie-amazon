import type { SellerSpriteCompetitorData } from '@cookie-amazon/protocol'

export const selectResearchAsins = (
  data: SellerSpriteCompetitorData,
  limit = 3,
): string[] => [...data.items]
  .filter((item) => /^[A-Z0-9]{10}$/.test(item.asin))
  .sort((left, right) => (right.estimatedSales ?? 0) - (left.estimatedSales ?? 0))
  .slice(0, limit)
  .map((item) => item.asin)