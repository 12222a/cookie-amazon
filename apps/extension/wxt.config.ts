import { defineConfig } from 'wxt'

export default defineConfig({
  // ponytail: Keep the legacy research sources out of the MCP connector build.
  filterEntrypoints: ['background', 'popup'],
  manifest: {
    name: 'SellerSprite MCP 连接器',
    description: '复用浏览器登录会话，为 AI 提供卖家精灵 MCP 能力，自动连接本机服务。',
    version: '0.2.0',
    minimum_chrome_version: '120',
    action: {
      default_popup: 'popup.html',
      default_title: 'SellerSprite MCP 连接器',
      default_icon: {
        16: 'icons/16.png',
        32: 'icons/32.png',
        48: 'icons/48.png',
        128: 'icons/128.png',
      },
    },
    icons: {
      16: 'icons/16.png',
      32: 'icons/32.png',
      48: 'icons/48.png',
      128: 'icons/128.png',
    },
    permissions: ['storage', 'cookies', 'scripting', 'tabs', 'alarms'],
    host_permissions: [
      'https://research.n8nmydomain.com/*',
      'https://www.sellersprite.com/*',
      'http://127.0.0.1:32123/*',
    ],
  },
})
