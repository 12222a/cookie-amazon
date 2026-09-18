import { defineContentScript } from 'wxt/utils/define-content-script'
import { isAmazonSearchUrl, markAmazonPage } from '../src/amazon/page'

/**
 * Injection skeleton: proves the host permission works and that a real search
 * page runs our script, without reading or changing page content yet. Card
 * parsing and selection arrive in a later step.
 */
export default defineContentScript({
  matches: ['https://www.amazon.com/*'],
  runAt: 'document_idle',
  main() {
    if (!isAmazonSearchUrl(location.href)) return
    markAmazonPage(document)
  },
})
