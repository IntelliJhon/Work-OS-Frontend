import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Session calls (login, refresh, logout) go through the dev server's own address, like the Vercel rewrites
    // in production, so the HttpOnly session cookie is first-party.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
