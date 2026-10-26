import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.MEMORY_DASHBOARD_API_PORT || env.PORT || '3001'
  // Same default as server.ts; a wildcard bind still answers on loopback.
  const apiHost = env.MEMORY_DASHBOARD_API_HOST || '127.0.0.1'
  const proxyHost = apiHost === '0.0.0.0' || apiHost === '::' ? '127.0.0.1' : apiHost

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': `http://${proxyHost.includes(':') ? `[${proxyHost}]` : proxyHost}:${apiPort}`,
      },
    },
  }
})
