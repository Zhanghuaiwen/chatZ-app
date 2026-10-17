import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Local ChatZ backend (SQLite storage; later the LLM/RAG proxy).
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      // SiliconFlow's API is OpenAI-compatible; strip the /siliconflow prefix
      // so the request is forwarded to https://api.siliconflow.cn/v1/...
      '/siliconflow': {
        target: 'https://api.siliconflow.cn/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/siliconflow/, ''),
      },
      // Local Ollama rejects requests carrying a foreign Origin header, so it
      // is overridden to match the target before forwarding.
      '/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Origin', 'http://127.0.0.1:11434')
          })
        },
      },
    },
  },
})
