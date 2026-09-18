import {
  CONTENT_SCRIPT_RUNTIME_PROBE_ACTION,
  CONTENT_SCRIPT_RUNTIME_PROBE_RESPONSE,
} from '@cookie-amazon/protocol'

const WEB_APP_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'https://research.n8nmydomain.com',
])

const repairWebTab = async (tabId: number): Promise<void> => {
  try {
    const tab = await browser.tabs.get(tabId)
    if (!tab.url || !WEB_APP_ORIGINS.has(new URL(tab.url).origin)) return
    try {
      const response = await browser.tabs.sendMessage(tabId, CONTENT_SCRIPT_RUNTIME_PROBE_ACTION)
      if (response === CONTENT_SCRIPT_RUNTIME_PROBE_RESPONSE) return
    } catch {
      // The page may have been opened before the extension was reloaded.
    }
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/content.js'],
    })
  } catch {
    // Tabs can disappear while the service worker is waking up.
  }
}

const repairWebTabs = async (): Promise<void> => {
  const tabs = await browser.tabs.query({})
  await Promise.all(tabs.flatMap((tab) => typeof tab.id === 'number' ? [repairWebTab(tab.id)] : []))
}

export const installWebTabRepair = (): void => {
  try {
    browser.runtime.onConnect.addListener((port) => {
      port.onDisconnect.addListener(() => {
        // Chrome reports bfcache navigation through runtime.lastError. Reading it
        // prevents an otherwise harmless bridge reconnect from becoming an
        // unchecked extension error.
        void browser.runtime.lastError
      })
    })
  } catch {
    // The WXT fake browser used during build does not implement onConnect.
  }

  browser.runtime.onInstalled.addListener(() => { void repairWebTabs() })
  browser.runtime.onStartup.addListener(() => { void repairWebTabs() })
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') void repairWebTab(tabId)
  })

  // Manual extension reloads do not reliably emit onInstalled or onStartup.
  // Repair already-open research tabs whenever the service worker boots so
  // stale content scripts left by the previous extension context are replaced.
  void repairWebTabs()
}