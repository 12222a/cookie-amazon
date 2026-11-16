import '../../src/popup.css'
import {
  SELLERSPRITE_MCP_BRIDGE_STATE_KEY,
  SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY,
  type SellerSpriteMcpBridgeState,
} from '../../src/background/sellersprite-mcp-bridge'

const statusElement = document.querySelector<HTMLParagraphElement>('#mcp-status')!
const versionElement = document.querySelector<HTMLParagraphElement>('#version')!
const tokenForm = document.querySelector<HTMLFormElement>('#mcp-token-form')!
const tokenInput = document.querySelector<HTMLInputElement>('#mcp-token')!
const saveTokenButton = document.querySelector<HTMLButtonElement>('#save-mcp-token')!
const tokenStatusElement = document.querySelector<HTMLParagraphElement>('#mcp-token-status')!

const statusLabels: Record<SellerSpriteMcpBridgeState['status'], string> = {
  unconfigured: '未配置 MCP 密钥',
  connecting: '正在连接本机 MCP 服务…',
  connected: '已连接本机 MCP 服务',
  'waiting-for-service': '等待本机 MCP 服务，服务启动后将自动连接',
  'authentication-error': 'MCP 密钥验证失败，请检查是否与本机服务的密钥一致',
}

const readState = (value: unknown): SellerSpriteMcpBridgeState | undefined => {
  if (typeof value !== 'object' || value === null
    || !('status' in value) || typeof value.status !== 'string' || !Object.hasOwn(statusLabels, value.status)
    || !('updatedAt' in value) || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) return undefined
  return value as SellerSpriteMcpBridgeState
}

let configured: boolean | undefined
let state: SellerSpriteMcpBridgeState | undefined
let storageError = false
let readVersion = 0

const renderStatus = (): void => {
  if (storageError) {
    statusElement.textContent = '无法读取 MCP 连接状态，请重新打开扩展'
  } else if (configured === undefined) {
    statusElement.textContent = '正在读取连接状态…'
  } else if (!configured) {
    statusElement.textContent = statusLabels.unconfigured
  } else if (!state || state.status === 'unconfigured'
    || (state.status === 'connected' && (Date.now() - state.updatedAt > 60_000 || state.updatedAt > Date.now()))) {
    statusElement.textContent = '连接状态待更新'
  } else {
    statusElement.textContent = statusLabels[state.status]
  }
}

const refreshStatus = async (): Promise<void> => {
  const version = ++readVersion
  try {
    const values = await browser.storage.local.get([SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY, SELLERSPRITE_MCP_BRIDGE_STATE_KEY])
    if (version !== readVersion) return
    const token = values[SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY]
    configured = typeof token === 'string' && token.trim().length >= 32
    state = readState(values[SELLERSPRITE_MCP_BRIDGE_STATE_KEY])
    storageError = false
  } catch {
    if (version !== readVersion) return
    storageError = true
  }
  renderStatus()
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local'
    && (SELLERSPRITE_MCP_BRIDGE_STATE_KEY in changes || SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY in changes)) {
    void refreshStatus()
  }
})

tokenForm.addEventListener('submit', (event) => {
  event.preventDefault()
  if (saveTokenButton.disabled) return
  const token = tokenInput.value.trim()
  if (token.length < 32) {
    tokenStatusElement.textContent = '密钥至少需要 32 个字符'
    tokenInput.focus()
    return
  }
  saveTokenButton.disabled = true
  tokenInput.disabled = true
  tokenStatusElement.textContent = '正在保存密钥…'
  void browser.storage.local.set({ [SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY]: token }).then(() => {
    tokenInput.value = ''
    tokenStatusElement.textContent = '密钥已保存，后台将自动连接，无需手动操作。'
  }).catch(() => {
    tokenStatusElement.textContent = '无法保存 MCP 密钥，请重试'
  }).finally(() => {
    saveTokenButton.disabled = false
    tokenInput.disabled = false
  })
})

versionElement.textContent = `扩展版本：v${browser.runtime.getManifest().version}`
void refreshStatus()
window.setInterval(renderStatus, 5_000)
