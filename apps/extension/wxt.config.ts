import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: 'Cookie Amazon Platform',
    description: 'Secure Web to Extension Phase 1 bridge',
    version: '0.1.0',
    action: { default_popup: 'popup.html' },
    permissions: ['storage'],
    host_permissions: ['http://localhost:5173/*', 'http://localhost:8787/*'],
    optional_host_permissions: ['https://example.com/*', 'https://www.sellersprite.com/*'],
  },
})