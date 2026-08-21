import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: 'Cookie Amazon Platform',
    description: 'Secure Web to Extension Phase 1 bridge',
    version: '0.1.2',
    action: { default_popup: 'popup.html' },
    permissions: ['storage', 'cookies', 'scripting', 'tabs'],
    host_permissions: ['http://localhost:5173/*', 'http://127.0.0.1:5173/*', 'http://localhost:8787/*'],
    optional_host_permissions: ['https://example.com/*', 'https://www.sellersprite.com/*'],
  },
})