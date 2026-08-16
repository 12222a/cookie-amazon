import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: 'Cookie Amazon Platform',
    description: 'Secure Web to Extension Phase 1 bridge',
    version: '0.1.0',
    permissions: [],
    host_permissions: ['http://localhost:5173/*'],
    optional_host_permissions: ['https://example.com/*'],
  },
})