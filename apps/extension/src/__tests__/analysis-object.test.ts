import { describe, expect, it } from 'vitest'
import { normalizeAsin, createAnalysisObject, isAnalysisObject } from '../analysis-object'

describe('normalizeAsin', () => {
  it('accepts a well-formed ASIN and upper-cases it', () => {
    expect(normalizeAsin('b07z82895w')).toBe('B07Z82895W')
    expect(normalizeAsin('  B07Z82895W  ')).toBe('B07Z82895W')
  })

  it('rejects anything that is not ten alphanumeric characters', () => {
    expect(normalizeAsin('B07Z82895')).toBeNull()
    expect(normalizeAsin('B07Z82895WW')).toBeNull()
    expect(normalizeAsin('B07Z8289-5')).toBeNull()
    expect(normalizeAsin('')).toBeNull()
    expect(normalizeAsin('   ')).toBeNull()
  })
})

describe('createAnalysisObject', () => {
  const base = { market: 'US', source: 'manual' as const, owner: 'amy', group: 'team-a', now: 1_700_000_000_000 }

  it('builds an object with every field the panel needs', () => {
    const created = createAnalysisObject({ asin: 'b07z82895w', ...base })
    expect(created).toEqual({
      asin: 'B07Z82895W',
      market: 'US',
      source: 'manual',
      storefront: null,
      owner: 'amy',
      group: 'team-a',
      createdAt: 1_700_000_000_000,
    })
  })

  it('returns null for an unusable ASIN instead of throwing', () => {
    expect(createAnalysisObject({ asin: 'not-an-asin', ...base })).toBeNull()
  })

  it('keeps an empty owner or group as null rather than an empty string', () => {
    const created = createAnalysisObject({ asin: 'B07Z82895W', ...base, owner: '  ', group: '' })
    expect(created?.owner).toBeNull()
    expect(created?.group).toBeNull()
  })
})

describe('isAnalysisObject', () => {
  it('accepts a complete object', () => {
    expect(isAnalysisObject({
      asin: 'B07Z82895W', market: 'US', source: 'manual', storefront: null,
      owner: null, group: null, createdAt: 1,
    })).toBe(true)
  })

  it('rejects partial or malformed records so stale storage cannot crash the panel', () => {
    expect(isAnalysisObject(null)).toBe(false)
    expect(isAnalysisObject({ asin: 'B07Z82895W' })).toBe(false)
    expect(isAnalysisObject({
      asin: 'B07Z82895W', market: 'US', source: 'nope', storefront: null,
      owner: null, group: null, createdAt: 1,
    })).toBe(false)
    expect(isAnalysisObject({
      asin: 'B07Z82895W', market: 'US', source: 'manual', storefront: null,
      owner: null, group: null, createdAt: 'yesterday',
    })).toBe(false)
  })
})

