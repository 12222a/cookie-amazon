import '../../src/popup.css'
import {
  CONTENT_SCRIPT_RUNTIME_PROBE_ACTION,
  CONTENT_SCRIPT_RUNTIME_PROBE_RESPONSE,
  isAllowedWebOrigin,
} from '@cookie-amazon/protocol'
import { TargetPermissionManager } from '../../src/targets/permissions'
import { TARGET_REGISTRY } from '../../src/targets/registry'

const targetId = 'sellersprite'
const statusElement = document.querySelector<HTMLParagraphElement>('#status')
const versionElement = document.querySelector<HTMLParagraphElement>('#version')
const pageElement = document.querySelector<HTMLParagraphElement>('#page')
const bridgeElement = document.querySelector<HTMLParagraphElement>('#bridge-status')
const repairBridgeButton = document.querySelector<HTMLButtonElement>('#repair-bridge')
const grantButton = document.querySelector<HTMLButtonElement>('#grant')
const openPanelButton = document.querySelector<HTMLButtonElement>('#open-panel')
const permissionManager = new TargetPermissionManager(TARGET_REGISTRY, browser.permissions)

const renderStatus = (granted: boolean, message?: string): void => {
  if (statusElement) statusElement.textContent = message ?? (granted ? '已授权' : '需要授权')
  if (grantButton) grantButton.disabled = granted
}

const probeTab = async (tabId: number): Promise<boolean> =>
  await browser.tabs.sendMessage(tabId, CONTENT_SCRIPT_RUNTIME_PROBE_ACTION) === CONTENT_SCRIPT_RUNTIME_PROBE_RESPONSE

const refreshBridgeStatus = async (): Promise<void> => {
  if (versionElement) versionElement.textContent = `扩展版本：v${browser.runtime.getManifest().version}`
  if (repairBridgeButton) repairBridgeButton.disabled = true
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
  const url = activeTab?.url
  if (pageElement) pageElement.textContent = `当前页面：${url ?? '无法读取'}`
  if (typeof activeTab?.id !== 'number' || !url) {
    if (bridgeElement) bridgeElement.textContent = '网页桥接：无法检测当前页面'
    return
  }

  let allowed = false
  try {
    allowed = isAllowedWebOrigin(new URL(url).origin)
  } catch {
    allowed = false
  }
  if (!allowed) {
    if (bridgeElement) bridgeElement.textContent = '网页桥接：当前页面不是受支持的本地地址'
    return
  }

  try {
    const ready = await probeTab(activeTab.id)
    if (bridgeElement) bridgeElement.textContent = ready
      ? '网页桥接：内容脚本已注入'
      : '网页桥接：内容脚本响应无效'
    if (repairBridgeButton) repairBridgeButton.disabled = ready
  } catch (error: unknown) {
    if (bridgeElement) bridgeElement.textContent = `网页桥接：内容脚本未注入（${error instanceof Error ? error.message : String(error)}）`
    if (repairBridgeButton) repairBridgeButton.disabled = false
  }
}

const refresh = async (): Promise<void> => {
  try {
    const [granted] = await Promise.all([
      permissionManager.hasPermission(targetId),
      refreshBridgeStatus(),
    ])
    renderStatus(granted)
  } catch {
    renderStatus(false, '无法读取权限状态')
  }
}

repairBridgeButton?.addEventListener('click', () => {
  if (repairBridgeButton) repairBridgeButton.disabled = true
  if (bridgeElement) bridgeElement.textContent = '网页桥接：正在重新注入内容脚本…'
  void (async () => {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (typeof activeTab?.id !== 'number' || !activeTab.url) throw new Error('无法读取当前页面')
    if (!isAllowedWebOrigin(new URL(activeTab.url).origin)) throw new Error('当前页面不是受支持的本地地址')
    await browser.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['/content-scripts/content.js'],
    })
    if (!(await probeTab(activeTab.id))) throw new Error('注入后内容脚本响应无效')
    if (bridgeElement) bridgeElement.textContent = '网页桥接：内容脚本已恢复，请返回网页点击“检测扩展”'
  })().catch((error: unknown) => {
    if (bridgeElement) bridgeElement.textContent = `网页桥接：恢复失败（${error instanceof Error ? error.message : String(error)}）`
    if (repairBridgeButton) repairBridgeButton.disabled = false
  })
})

grantButton?.addEventListener('click', () => {
  if (grantButton) grantButton.disabled = true
  if (statusElement) statusElement.textContent = '等待 Chrome 确认…'
  void permissionManager.requestPermission(targetId)
    .then((granted) => renderStatus(granted))
    .catch(() => renderStatus(false, '授权失败，请重试'))
})

// 侧边栏必须由用户手势触发，popup 里的点击正好满足；
// 若当前窗口已有侧边栏设置，open 会沿用该窗口的设置。
openPanelButton?.addEventListener('click', () => {
  void (async () => {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (typeof activeTab?.windowId !== 'number') throw new Error('NO_WINDOW')
    await browser.sidePanel.open({ windowId: activeTab.windowId })
    window.close()
  })().catch(() => {
    if (openPanelButton) openPanelButton.textContent = '无法打开面板，请重试'
  })
})

void refresh()
