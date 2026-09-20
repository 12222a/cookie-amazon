import { defineContentScript } from 'wxt/utils/define-content-script'
import { AnalysisObjectStore, ANALYSIS_OBJECT_STORAGE_KEY } from '../src/analysis-object-store'
import { askAnalysis } from '../src/panel/analysis-client'
import { analysisFetchThroughBackground } from '../src/panel/analysis-ask-relay'
import { mountOverlay } from '../src/panel/overlay'
import { OverlayController } from '../src/panel/overlay-controller'
import { initialOverlayPosition } from '../src/panel/overlay-placement'
import { OverlayPreferenceStore } from '../src/panel/overlay-preference-store'
import { OPEN_SIDE_PANEL_ACTION } from '../src/panel/open-side-panel'
import { ConversationStore, CONVERSATION_STORAGE_KEY, type PublishedConversation } from '../src/panel/conversation-store'

/**
 * 页面内浮层。
 *
 * 与入口注入脚本（amazon.content.ts）分开：那个只做识别与上报，本脚本只做展示。
 * #5 要求浮层渲染失败时静默消失，所以 DOM 操作都在 mountOverlay 与控制器内部被兜住。
 *
 * 取数仍然只有侧边栏一处（#22）。提问从 #24 起在浮层里也能发起：端点没有 CORS 头，
 * 页面侧直连会被同源策略挡掉，所以消息交给 background 代发（analysis-ask-relay）。
 *
 * 答出来的那一轮写回侧边栏发布的那条对话串（conversation-store）。两个壳订阅的是同一个键，
 * 发布时都以「先读完再补上自己那一轮」的方式写，所以一处问、另一处看到的是同一条。
 */
export default defineContentScript({
  matches: ['https://www.amazon.com/*'],
  runAt: 'document_idle',
  main() {
    const objectStore = new AnalysisObjectStore(browser.storage.local)
    const preferenceStore = new OverlayPreferenceStore(browser.storage.local)
    const conversationStore = new ConversationStore(browser.storage.local)
    /**
     * 对话是同步读出来的：渲染是同步的，而存储读取是异步的。
     * 每次变更先把它读进内存，渲染时只读内存——否则渲染要么变成异步，要么拿到上一次的快照。
     */
    let conversation: PublishedConversation | null = null
    let running = false
    let pending = false
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
        readConversation: () => conversation,
        /**
         * 浮层里的提问：换的是传输（经 background 中转），其余——超时、提示文案、
         * UNSUPPORTED_SCOPE 语义——与侧边栏共用 analysis-client 这一个实现。
         */
        askAnalysis: (question, evidence, history) => askAnalysis(question, evidence, {
          fetcher: analysisFetchThroughBackground((message) => browser.runtime.sendMessage(message)),
          history,
        }),
        /**
         * 浮层问出来的那一轮写回共有的那条对话串。
         *
         * 写完立刻把内存里那一份换成新的，并重画：存储事件也会回来，但那要绕一圈，
         * 屏幕上这一轮应当马上就在（AC 的「一处问、另一处立即看到」）。
         */
        publishConversation: async (next) => {
          if (!await conversationStore.write(next)) return false
          conversation = next
          await controller.sync()
          return true
        },
      }, controller.currentPosition()),
      readObject: () => objectStore.read(),
      readPreference: () => preferenceStore.read(),
      writePreference: (preference) => preferenceStore.write(preference),
      initialPosition: () => initialOverlayPosition({ width: window.innerWidth, height: window.innerHeight }),
    })

    /**
     * 读一次对话再渲染一次，两次之间不留缝：控制器会把并发的 sync 合成一次，
     * 若先 sync 再读，那次渲染就会用上还没更新的那一份，屏幕上一直停着旧对话。
     * 变更可能连着来，所以忙碌时只记一个「还得再来一次」，由当前这轮收尾时补上。
     */
    const syncConversation = async (): Promise<void> => {
      if (running) { pending = true; return }
      running = true
      try {
        do {
          pending = false
          conversation = await conversationStore.read()
          await controller.sync()
        } while (pending)
      } finally {
        running = false
      }
    }

    // 面板与浮层读同一份存储；任一处写入后另一处据此更新（AC 的「两处同步」）。
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || Object.keys(changes).length === 0) return
      // 切对象与换对话都只走这一条路：读到的就是当下该显示的那一份。
      if (ANALYSIS_OBJECT_STORAGE_KEY in changes || CONVERSATION_STORAGE_KEY in changes) void syncConversation()
    })

    void syncConversation()
  },
})
