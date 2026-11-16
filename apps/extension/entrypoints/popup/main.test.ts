import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import popupHtml from './index.html?raw'
import {
  SELLERSPRITE_MCP_BRIDGE_STATE_KEY as STATE_KEY,
  SELLERSPRITE_MCP_BRIDGE_TOKEN_KEY as TOKEN_KEY,
} from '../../src/background/sellersprite-mcp-bridge'

type StorageValues = Record<string, unknown>
type StorageListener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => void

const savedToken = 'popup-regression-existing-token-12345678'
const storageGet = vi.fn<() => Promise<StorageValues>>()
const storageSet = vi.fn<(values: StorageValues) => Promise<void>>()
let values: StorageValues
let storageListener: StorageListener

const status = (): string => document.querySelector('#mcp-status')!.textContent!
const tokenInput = (): HTMLInputElement => document.querySelector('#mcp-token')!
const tokenStatus = (): string => document.querySelector('#mcp-token-status')!.textContent!
const saveButton = (): HTMLButtonElement => document.querySelector('#save-mcp-token')!
const flush = async (): Promise<void> => { await vi.advanceTimersByTimeAsync(0) }
const mount = async (): Promise<void> => { await import('./main'); await flush() }
const submit = (): void => {
  document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}
const updateStorage = async (updates: StorageValues): Promise<void> => {
  Object.assign(values, updates)
  storageListener(Object.fromEntries(Object.entries(updates).map(([key, newValue]) => [key, { newValue }])), 'local')
  await flush()
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-16T08:00:00Z'))
  document.documentElement.innerHTML = popupHtml
  values = { [TOKEN_KEY]: savedToken }
  storageGet.mockReset().mockImplementation(async () => ({ ...values }))
  storageSet.mockReset().mockImplementation(async (updates) => { await updateStorage(updates) })
  vi.stubGlobal('browser', {
    runtime: { getManifest: () => ({ version: '1.2.3' }) },
    storage: {
      local: { get: storageGet, set: storageSet },
      onChanged: { addListener: (listener: StorageListener) => { storageListener = listener } },
    },
  })
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SellerSprite MCP connector popup', () => {
  it('shows only connector controls, a browser login link, and collapsed password settings', async () => {
    await mount()
    expect(document.title).toBe('SellerSprite MCP 连接器')
    expect(document.querySelector('h1')!.textContent).toBe(document.title)
    expect(document.querySelector('#version')!.textContent).toContain('v1.2.3')
    expect(document.body.textContent).not.toMatch(/选品|当前页面|网页桥接|重新注入|授权/)
    expect(document.querySelectorAll('button')).toHaveLength(1)
    const link = document.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://www.sellersprite.com')
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noopener')
    expect(document.querySelector('details')!.open).toBe(false)
    expect(tokenInput().type).toBe('password')
    expect(tokenInput().minLength).toBe(32)
    expect(tokenInput().labels).toHaveLength(1)
    expect(tokenInput().value).toBe('')
    expect(document.documentElement.innerHTML).not.toContain(savedToken)
    expect(document.querySelector('#mcp-status')!.getAttribute('role')).toBe('status')
  })

  it.each([
    ['connecting', '正在连接本机 MCP 服务'],
    ['connected', '已连接本机 MCP 服务'],
    ['waiting-for-service', '等待本机 MCP 服务'],
    ['authentication-error', 'MCP 密钥验证失败'],
    ['unconfigured', '连接状态待更新'],
  ])('renders the background state %s without treating service downtime as a login failure', async (state, expected) => {
    values[STATE_KEY] = { status: state, updatedAt: Date.now() }
    await mount()
    expect(status()).toContain(expected)
    expect(status()).not.toContain('登录失败')
  })

  it('reports an absent token as unconfigured even if an old connected record remains', async () => {
    delete values[TOKEN_KEY]
    values[STATE_KEY] = { status: 'connected', updatedAt: Date.now() }
    await mount()
    expect(status()).toBe('未配置 MCP 密钥')
  })

  it('ages connected records locally after 60 seconds and recovers on a fresh storage update', async () => {
    values[STATE_KEY] = { status: 'connected', updatedAt: Date.now() }
    await mount()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(status()).toBe('已连接本机 MCP 服务')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(status()).toBe('连接状态待更新')
    expect(storageGet).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
    await updateStorage({ [STATE_KEY]: { status: 'connected', updatedAt: Date.now() } })
    expect(status()).toBe('已连接本机 MCP 服务')
    await updateStorage({ [TOKEN_KEY]: undefined })
    expect(status()).toBe('未配置 MCP 密钥')
  })

  it.each([
    undefined,
    { status: 'connected' },
    { status: 'connected', updatedAt: 'invalid' },
    { status: 'connected', updatedAt: Number.NaN },
    { status: 'toString', updatedAt: 0 },
  ])('does not claim a connection for malformed state %j', async (state) => {
    values[STATE_KEY] = state
    await mount()
    expect(status()).toBe('连接状态待更新')
  })

  it.each([-60_001, 1])('rejects an expired or future connected timestamp with offset %i', async (offset) => {
    values[STATE_KEY] = { status: 'connected', updatedAt: Date.now() + offset }
    await mount()
    expect(status()).toBe('连接状态待更新')
  })

  it('ignores unrelated storage events and other storage areas', async () => {
    await mount()
    storageListener({ unrelated: { newValue: true } }, 'local')
    storageListener({ [STATE_KEY]: { newValue: {} } }, 'sync')
    await flush()
    expect(storageGet).toHaveBeenCalledTimes(1)
  })

  it('keeps the latest state when the initial storage read completes late', async () => {
    let completeInitialRead!: (value: StorageValues) => void
    storageGet.mockImplementationOnce(() => new Promise((resolve) => { completeInitialRead = resolve }))
    await mount()
    expect(status()).toContain('正在读取')
    await updateStorage({ [STATE_KEY]: { status: 'waiting-for-service', updatedAt: Date.now() } })
    completeInitialRead({ [TOKEN_KEY]: savedToken, [STATE_KEY]: { status: 'connected', updatedAt: Date.now() } })
    await flush()
    expect(status()).toContain('等待本机 MCP 服务')
  })

  it('shows storage read errors without claiming a connection and recovers on a later change', async () => {
    storageGet.mockRejectedValueOnce(new Error('storage unavailable'))
    await mount()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(status()).toContain('无法读取 MCP 连接状态')
    await updateStorage({ [STATE_KEY]: { status: 'connecting', updatedAt: Date.now() } })
    expect(status()).toContain('正在连接')
  })

  it.each(['', ' '.repeat(32), 'x'.repeat(31)])('rejects blank or short secrets without removing the saved token', async (token) => {
    await mount()
    tokenInput().value = token
    submit()
    await flush()
    expect(storageSet).not.toHaveBeenCalled()
    expect(tokenStatus()).toContain('至少需要 32 个字符')
    expect(values[TOKEN_KEY]).toBe(savedToken)
  })

  it('saves a trimmed 32-character token once, clears the input, and leaves connection reporting to the background', async () => {
    await mount()
    const token = 'n'.repeat(32)
    tokenInput().value = `  ${token}  `
    submit()
    submit()
    expect(saveButton().disabled).toBe(true)
    await flush()
    expect(storageSet).toHaveBeenCalledExactlyOnceWith({ [TOKEN_KEY]: token })
    expect(tokenInput().value).toBe('')
    expect(saveButton().disabled).toBe(false)
    expect(tokenStatus()).toContain('后台将自动连接')
    expect(status()).toBe('连接状态待更新')
    expect(document.documentElement.innerHTML).not.toContain(token)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retains masked input and enables retry when saving fails without displaying the error or secret', async () => {
    await mount()
    storageSet.mockRejectedValueOnce(new Error(savedToken))
    tokenInput().value = savedToken
    submit()
    await flush()
    expect(tokenStatus()).toBe('无法保存 MCP 密钥，请重试')
    expect(tokenInput().value).toBe(savedToken)
    expect(tokenInput().disabled).toBe(false)
    expect(saveButton().disabled).toBe(false)
    expect(document.body.textContent).not.toContain(savedToken)
  })
})
