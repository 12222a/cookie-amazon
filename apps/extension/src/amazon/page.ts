/**
 * Amazon search pages are the only surface the injection reads. Both the
 * current `/s?k=` shape and the legacy `/s/ref=...&field-keywords=` shape count;
 * product pages, other marketplaces and non-Amazon hosts do not.
 */
export const isAmazonSearchUrl = (value: string): boolean => {
  if (typeof value !== 'string' || value.trim() === '') return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.hostname !== 'www.amazon.com') return false
  if (url.username !== '' || url.password !== '') return false
  if (!/^\/s(?:\/|$)/.test(url.pathname)) return false
  const keyword = url.searchParams.get('k') ?? url.searchParams.get('field-keywords')
  return keyword !== null && keyword.trim() !== ''
}

/** Set on the document root once this script has run, so a run is observable. */
export const AMAZON_INJECTION_ATTRIBUTE = 'data-ca-amazon-injected'

/**
 * Writes the run marker. Failures are swallowed: an unmarked page must never
 * break browsing, and a document without a root element is simply not ready.
 */
export const markAmazonPage = (document: Document): void => {
  try {
    document.documentElement?.setAttribute(AMAZON_INJECTION_ATTRIBUTE, 'true')
  } catch {
    // A hostile or half-parsed document must not surface an error to the page.
  }
}
