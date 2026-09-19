import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: '跨境选品助手',
    description: '跨境选品数据连接扩展',
    version: '0.1.20',
    action: { default_popup: 'popup.html' },
    permissions: ['storage', 'cookies', 'scripting', 'tabs'],
    host_permissions: [
      'http://localhost:5173/*', 'http://127.0.0.1:5173/*', 'http://localhost:5174/*', 'http://127.0.0.1:5174/*',
      'https://research.n8nmydomain.com/*', 'http://localhost:8787/*',
      'https://www.sellersprite.com/*',
      'https://www.amazon.com/*',
    ],
    optional_host_permissions: ['https://example.com/*'],
  },
})
