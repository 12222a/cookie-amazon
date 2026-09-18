import { describe, expect, it } from 'vitest'
import { AMAZON_INJECTION_ATTRIBUTE, isAmazonSearchUrl, markAmazonPage } from '../page'

const fakeDocument = (attributes: Map<string, string>): Document => ({
  documentElement: {
    setAttribute: (name: string, value: string) => { attributes.set(name, value) },
    getAttribute: (name: string) => attributes.get(name) ?? null,
  },
}) as unknown as Document

describe('amazon search page detection', () => {
  it('accepts the current and legacy US search result URL shapes', () => {
    expect(isAmazonSearchUrl('https://www.amazon.com/s?k=phone+stand')).toBe(true)
    expect(isAmazonSearchUrl('https://www.amazon.com/s?k=phone+stand&page=2')).toBe(true)
    expect(isAmazonSearchUrl('https://www.amazon.com/s/?k=phone+stand')).toBe(true)
    expect(isAmazonSearchUrl('https://www.amazon.com/s/ref=nb_sb_noss?field-keywords=phone+stand')).toBe(true)
  })

  it('rejects product pages, other marketplaces and malformed input', () => {
    expect(isAmazonSearchUrl('https://www.amazon.com/dp/B0ABCDEFGH')).toBe(false)
    expect(isAmazonSearchUrl('https://www.amazon.com/')).toBe(false)
    expect(isAmazonSearchUrl('https://www.amazon.com/s?k=')).toBe(false)
    expect(isAmazonSearchUrl('https://www.amazon.co.uk/s?k=phone+stand')).toBe(false)
    expect(isAmazonSearchUrl('https://www.amazon.com.evil.example/s?k=x')).toBe(false)
    expect(isAmazonSearchUrl('not a url')).toBe(false)
    expect(isAmazonSearchUrl('')).toBe(false)
  })
})

describe('amazon injection marker', () => {
  it('marks the document root', () => {
    const attributes = new Map<string, string>()
    markAmazonPage(fakeDocument(attributes))
    expect(attributes.get(AMAZON_INJECTION_ATTRIBUTE)).toBe('true')
  })

  it('stays silent when the page has no root element yet', () => {
    expect(() => markAmazonPage({ documentElement: null } as unknown as Document)).not.toThrow()
  })
})
