import { defineContentScript } from 'wxt/utils/define-content-script'
import { AnalysisObjectStore, ANALYSIS_OBJECT_STORAGE_KEY } from '../src/analysis-object-store'
import { mountOverlay } from '../src/panel/overlay'
import { OverlayController } from '../src/panel/overlay-controller'
import { initialOverlayPosition } from '../src/panel/overlay-placement'
import { OverlayPreferenceStore } from '../src/panel/overlay-preference-store'
import { OPEN_SIDE_PANEL_ACTION } from '../src/panel/open-side-panel'
import { KeywordPositionCache, KEYWORD_POSITION_CACHE_STORAGE_KEY } from '../src/panel/keyword-position-cache'
import { requestKeywordPositionsCached } from '../src/panel/keyword-position-cache-client'
import type { KeywordPositionRow } from '../src/panel/keyword-positions'

/**
 * 页面内浮层。
 *
 * 与入口注入脚本（amazon.content.ts）分开：那个只做识别与上报，本脚本只做展示。
 * issue #5 要求浮层渲染失败时静默消失，所以 DOM 操作都在 mountOverlay 与控制器内部被兜住。
 */
export default defineContentScript({
  matches: ['https://www.amazon.com/*'],
  runAt: 'document_idle',
  main() {
    const objectStore = new AnalysisObjectStore(browser.storage.local)
    const preferenceStore = new OverlayPreferenceStore(browser.storage.local)
    const positionCache = new KeywordPositionCache(browser.storage.local)
    let keywordRows: readonly KeywordPositionRow[] = []
    let keywordTarget: string | null = null
    let keywordLoadingTarget: string | null = null

    // 先声明再赋值：createView 里的回调要引用 controller 自身（收起与拖动），
    // 直接 const 会让类型推断绕回自己（TS7022）。
    let controller: OverlayController
    controller = new OverlayController({
      createView: () => mountOverlay(document, {
        onPin: async () => {
          // sidePanel 与 windows 在 content script 里不可用（Chromium feature 表里是
          // privileged_extension），必须由 background 用发送者的 tabId 代开。
          try {
            const response = await browser.runtime.sendMessage({ action: OPEN_SIDE_PANEL_ACTION })
            return (response as { ok?: unknown } | null)?.ok === true
          } catch {
            return false
          }
        },
        onToggleCollapsed: () => { void controller.toggleCollapsed() },
        onMove: (position) => { void controller.move(position) },
        readKeywordRows: () => keywordRows,
      }, controller.currentPosition()),
      readObject: () => objectStore.read(),
      readPreference: () => preferenceStore.read(),
      writePreference: (preference) => preferenceStore.write(preference),
      initialPosition: () => initialOverlayPosition({ width: window.innerWidth, height: window.innerHeight }),
    })

    const syncKeywordRows = async (force = false): Promise<void> => {
      const object = await objectStore.read()
      if (object === null) {
        keywordTarget = null
        keywordLoadingTarget = null
        keywordRows = []
        return
      }
      const target = object.asin + ':' + object.market
      if (keywordLoadingTarget === target || (!force && keywordTarget === target)) return
      keywordTarget = target
      keywordLoadingTarget = target
      keywordRows = []
      const result = await requestKeywordPositionsCached(object.asin, object.market, { cache: positionCache })
      if (keywordTarget !== target) return
      keywordLoadingTarget = null
      keywordRows = result.kind === 'rows' ? result.rows : []
      await controller.sync()
    }

    // 面板与浮层读同一份存储；任一处写入后另一处据此更新（AC 的「两处同步」）。
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || Object.keys(changes).length === 0) return
      if (ANALYSIS_OBJECT_STORAGE_KEY in changes) {
        keywordTarget = null
        keywordLoadingTarget = null
        keywordRows = []
      }
      void controller.sync()
      void syncKeywordRows(KEYWORD_POSITION_CACHE_STORAGE_KEY in changes)
    })

    void controller.sync()
    void syncKeywordRows()
  },
})
