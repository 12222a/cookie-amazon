export const OPEN_SIDE_PANEL_ACTION = 'COOKIE_AMAZON_OPEN_SIDE_PANEL'

export const OPEN_SIDE_PANEL_OPENED = 'open_side_panel_opened'
export const OPEN_SIDE_PANEL_FAILED = 'open_side_panel_failed'

export type OpenSidePanelApi = {
  runtime: {
    onMessage: {
      addListener(listener: (message: unknown, sender: unknown) => unknown): void
    }
  }
  sidePanel: {
    open(options: { tabId: number }): Promise<void>
  }
}

const senderTabId = (sender: unknown): number | null => {
  if (typeof sender !== 'object' || sender === null) return null
  const tab = (sender as { tab?: { id?: unknown } }).tab
  return typeof tab?.id === 'number' ? tab.id : null
}

/**
 * 侧边栏只能由 background 打开。
 *
 * `sidePanel` 与 `windows` 在 Chromium 的 feature 表里都是 privileged_extension，
 * content script 里拿到的是 undefined——页面侧直接调用必然抛错。
 * 因此浮层的「固定到侧边栏」只能发消息，由这里用发送者的 tabId 代调。
 *
 * 用 tabId 而不是 windowId：用户在哪张标签页点的，面板就开在哪张标签页。
 */
export const registerOpenSidePanelHandler = (api: OpenSidePanelApi): void => {
  api.runtime.onMessage.addListener((message, sender) => {
    if (typeof message !== 'object' || message === null) return false
    if ((message as { action?: unknown }).action !== OPEN_SIDE_PANEL_ACTION) return false
    const tabId = senderTabId(sender)
    if (tabId === null) return false
    return api.sidePanel.open({ tabId })
      .then(() => ({ ok: true }))
      .catch(() => ({ ok: false }))
  })
}

