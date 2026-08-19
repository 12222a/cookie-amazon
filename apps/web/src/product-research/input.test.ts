import { describe, expect, it } from 'vitest'
import {
  buildCompetitorResearchInput,
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