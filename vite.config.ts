import { defineConfig } from 'vite'

const BACKEND = 'https://treasure-hunt-backend.vercel.app'

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
})
