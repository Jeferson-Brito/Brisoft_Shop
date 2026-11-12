import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5180,
    // Em desenvolvimento, redireciona /api e /socket.io para o backend Express
    proxy: {
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3010',
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
