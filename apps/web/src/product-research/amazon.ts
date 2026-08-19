import type { ProductObservation } from '@cookie-amazon/analytics'

const AMAZON_HOSTS: Readonly<Record<string, string>> = {
  AU: 'www.amazon.com.au',
  CA: 'www.amazon.ca',
  DE: 'www.amazon.de',
  ES: 'www.amazon.es',
  FR: 'www.amazon.fr',
  IN: 'www.amazon.in',
  IT: 'www.amazon.it',
  JP: 'www.amazon.co.jp',
  MX: 'www.amazon.com.mx',
  UK: 'www.amazon.co.uk',
  US: 'www.amazon.com',
}

export const amazonProductUrl = (market: string, asin: string): string | null => {
  const host = AMAZON_HOSTS[market.trim().toUpperCase()]
  const safeAsin = asin.trim()
  if (!host || !/^[A-Z0-9]{10}$/.test(safeAsin)) return null
  return `https://${host}/dp/${encodeURIComponent(safeAsin)}`
}

export const productSearchText = (product: ProductObservation): string =>
  [product.asin, product.title ?? '', product.brand ?? ''].join(' ')