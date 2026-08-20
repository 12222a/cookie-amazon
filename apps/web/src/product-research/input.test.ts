import { describe, expect, it } from 'vitest'
import {
  buildCompetitorResearchInput,
  buildKeywordReverseInput,
  buildMarketResearchInput,
  getMarketResearchMonthOptions,
  DEFAULT_QUERY,
  validateProductResearchQuery,
} from './input'
import { amazonProductUrl } from './amazon'

describe('product research keyword input', () => {
  it('requires a safe English keyword and maps it into the named input', () => {
    expect(validateProductResearchQuery(DEFAULT_QUERY)).toBe('KEYWORD_REQUIRED')
    const query = { ...DEFAULT_QUERY, keyword: ' wireless charger ' }
    expect(validateProductResearchQuery(query)).toBeNull()
    expect(buildCompetitorResearchInput(query).keywords).toBe('wireless charger')
  })

  it('builds the observed SellerSprite ASIN reverse contract', () => {
    expect(buildKeywordReverseInput('b000000000', 'US')).toEqual({
      asin: 'B000000000', marketId: 1, month: '', forceReStat: false, badges: [], limit: 50,
    })
    expect(() => buildKeywordReverseInput('invalid', 'US')).toThrow('INVALID_ASIN')
    expect(() => buildKeywordReverseInput('B000000000', 'JP')).toThrow('UNSUPPORTED_KEYWORD_MARKET')
  })

  it('builds the observed US market research allowlist', () => {
    expect(buildMarketResearchInput(' phone stand ', 'US', 'bsr_sales_nearly', 3)).toEqual({
      marketId: 1,
      departmentKeyword: 'phone stand',
      monthName: 'bsr_sales_nearly',
      newReleaseNum: 3,
    })
    expect(getMarketResearchMonthOptions(new Date(2026, 7, 17))).toEqual([
      { value: 'bsr_sales_nearly', label: '最近 30 天' },
      { value: 'bsr_sales_monthly_202607', label: '2026-07' },
      { value: 'bsr_sales_monthly_202606', label: '2026-06' },
      { value: 'bsr_sales_monthly_202605', label: '2026-05' },
      { value: 'bsr_sales_monthly_202604', label: '2026-04' },
      { value: 'bsr_sales_monthly_202603', label: '2026-03' },
      { value: 'bsr_sales_monthly_202602', label: '2026-02' },
      { value: 'bsr_sales_monthly_202601', label: '2026-01' },
      { value: 'bsr_sales_monthly_202512', label: '2025-12' },
      { value: 'bsr_sales_monthly_202511', label: '2025-11' },
      { value: 'bsr_sales_monthly_202510', label: '2025-10' },
      { value: 'bsr_sales_monthly_202509', label: '2025-09' },
      { value: 'bsr_sales_monthly_202508', label: '2025-08' },
      { value: 'bsr_sales_monthly_202507', label: '2025-07' },
    ])
    expect(() => buildMarketResearchInput('phone stand', 'JP', 'bsr_sales_nearly', 6))
      .toThrow('UNSUPPORTED_MARKET_RESEARCH_MARKET')
    expect(() => buildMarketResearchInput('phone stand', 'US', 'bsr_sales_monthly_199901', 6))
      .toThrow('INVALID_MARKET_RESEARCH_MONTH')
    expect(() => buildMarketResearchInput('phone stand', 'US', 'bsr_sales_nearly', 9 as never))
      .toThrow('INVALID_NEW_RELEASE_MONTHS')
  })

  it('rejects non-English and oversized keywords', () => {
    expect(validateProductResearchQuery({ ...DEFAULT_QUERY, keyword: '无线充电器' })).toBe('KEYWORD_INVALID')
    expect(validateProductResearchQuery({ ...DEFAULT_QUERY, keyword: 'a'.repeat(81) })).toBe('KEYWORD_INVALID')
  })
})

describe('amazon product URL', () => {
  it('only builds links for supported markets and ASINs', () => {
    expect(amazonProductUrl('US', 'B000000000')).toBe('https://www.amazon.com/dp/B000000000')
    expect(amazonProductUrl('DE', 'B000000000')).toBe('https://www.amazon.de/dp/B000000000')
    expect(amazonProductUrl('XX', 'B000000000')).toBeNull()
    expect(amazonProductUrl('US', 'not-an-asin')).toBeNull()
  })
})