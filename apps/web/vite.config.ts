import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const designServiceTarget = env.DESIGN_SERVICE_PROXY_TARGET || 'http://127.0.0.1:8788'
  const proxy = { '/api': { target: designServiceTarget, changeOrigin: true } }

  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
  }
})