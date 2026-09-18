import { defineContentScript } from 'wxt/utils/define-content-script'
import { AnalysisObjectStore } from '../src/analysis-object-store'
import { mountOverlay, type OverlayHandle } from '../src/panel/overlay'
import { initialOverlayPosition } from '../src/panel/overlay-placement'
import { OverlayPreferenceStore } from '../src/panel/overlay-preference-store'
import { overlayMode } from '../src/panel/overlay-state'

/**
 * 页面内浮层。
 *
 * 与入口注入脚本（amazon.content.ts）分开：那个只做识别与上报，本脚本只做展示。
 * issue #5 要求浮层渲染失败时静默消失，所以所有 DOM 操作都包在 try 里，
 * 且不注册任何会抛错到页面的事件监听。
 */
export default defineContentScript({
  matches: ['https://www.amazon.com/*'],
  runAt: 'document_idle',
  main() {
    const objectStore = new AnalysisObjectStore(browser.storage.local)
    const preferenceStore = new OverlayPreferenceStore(browser.storage.local)
    let handle: OverlayHandle | null = null
    let preference = { collapsed: true, position: null } as Awaited<ReturnType<OverlayPreferenceStore['read']>>
    let current: Awaited<ReturnType<AnalysisObjectStore['read']>> = null

    const paint = (): void => {
      if (handle === null) return
      try {
        handle.render(current, overlayMode(current, preference.collapsed))
      } catch {
        // 渲染失败留原样；侧边栏不受影响。
      }
    }

    const remember = (next: { collapsed: boolean; position?: typeof preference.position }): void => {
      // 收起 / 展开只改 collapsed，保留用户已经拖到的位置——位置与开合是两件事。
      preference = { collapsed: next.collapsed, position: next.position ?? preference.position }
      void preferenceStore.write(preference)
      paint()
    }

    const mount = async (): Promise<void> => {
      preference = await preferenceStore.read()
      current = await objectStore.read()
      if (current === null) return
      handle = mountOverlay(document, {
        onPin: () => {
          // 打开侧边栏必须由 content script 里的用户手势触发（Chrome 116+），
          // 所以同步返回 open() 的 promise，不在它之前插入任何 await。
          try {
            return browser.sidePanel.open({ windowId: browser.windows.WINDOW_ID_CURRENT })
              .then(() => true)
              .catch(() => false)
          } catch {
            return Promise.resolve(false)
          }
        },
        onToggleCollapsed: () => remember({ collapsed: !preference.collapsed }),
        onMove: (position) => remember({ collapsed: preference.collapsed, position }),
      }, preference.position ?? initialOverlayPosition({
        width: window.innerWidth,
        height: window.innerHeight,
      }))
      paint()
    }

    // 面板与浮层读同一份存储；任一处写入后另一处据此更新（AC 的「两处同步」）。
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return
      try {
        if (Object.keys(changes).length === 0) return
        void (async () => {
          current = await objectStore.read()
          if (handle === null) { if (current !== null) await mount(); return }
          paint()
        })()
      } catch {
        // 存储事件处理失败不影响页面。
      }
    })

    void mount().catch(() => { /* 挂载失败即无浮层，页面照常 */ })
  },
})
