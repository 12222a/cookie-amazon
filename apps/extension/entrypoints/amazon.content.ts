import { defineContentScript } from 'wxt/utils/define-content-script'
import { isAmazonSearchUrl, markAmazonPage } from '../src/amazon/page'
import { SEARCH_RESULT_CARD_SELECTOR } from '../src/amazon/search-results'
import { mountCardSelection, SELECTION_STYLE_ID, SELECTION_STYLE_TEXT } from '../src/amazon/selection'

/**
 * 亚马逊搜索页的识别与上报层。
 *
 * 只做三件事：写入运行标记、标记搜索结果卡片、把点击变成一次选中上报写入对象存储。
 * 不渲染任何业务 UI（浮层是另一个脚本，见 amazon-overlay.content.ts），
 * 因此卡片识别失败时页面完全不受影响，只是没有卡片可点。
 *
 * 样式由脚本自己注入，而不走 WXT 的 content.css 入口：那个机制按入口名配对，
 * 同名 CSS 与 TS 会被判成重复入口，构建直接失败。
 */
export default defineContentScript({
  matches: ['https://www.amazon.com/*'],
  runAt: 'document_idle',
  main() {
    if (!isAmazonSearchUrl(location.href)) return
    markAmazonPage(document)
    try {
      injectSelectionStyle(document)
      const handle = mountCardSelection(document, browser.storage.local)
      // 搜索结果在首屏之后仍会插入（分页、懒加载），所以重新扫一遍已标记的卡片。
      // 合并到每个动画帧一次：亚马逊搜索结果页变更极其频繁，逐条触发会把整页查询刷爆。
      const target = document.querySelector(SEARCH_RESULT_CARD_SELECTOR)?.parentElement ?? document.body
      let scheduled = false
      new MutationObserver(() => {
        if (scheduled) return
        scheduled = true
        window.requestAnimationFrame(() => {
          scheduled = false
          handle.refresh()
        })
      }).observe(target, { childList: true, subtree: true })
    } catch {
      // 样式、观察器或挂载失败时保持页面原样；已写入的运行标记不受影响。
    }
  },
})

const injectSelectionStyle = (document: Document): void => {
  try {
    if (document.getElementById(SELECTION_STYLE_ID) !== null) return
    const style = document.createElement('style')
    style.id = SELECTION_STYLE_ID
    style.textContent = SELECTION_STYLE_TEXT
    document.head?.append(style)
  } catch {
    // 注入样式失败只影响外观，选中照常工作。
  }
}
