import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: '跨境选品助手',
    description: '跨境选品数据连接扩展',
    version: '0.1.3',
    action: { default_popup: 'popup.html' },
    permissions: ['storage', 'cookies', 'scripting', 'tabs'],
    host_permissions: ['http://localhost:5173/*', 'http://127.0.0.1:5173/*', 'http://localhost:8787/*'],
    optional_host_permissions: ['https://example.com/*', 'https://www.sellersprite.com/*'],
  },
})