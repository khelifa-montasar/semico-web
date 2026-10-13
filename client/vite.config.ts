import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    // Proxy the API in dev so the browser sees a single origin. This is what lets the refresh
    // token live in an httpOnly SameSite=Lax cookie without needing CORS or SameSite=None.
    //
    // NOTE: deliberately no `rewrite`. The client's base URL already carries the version segment
    // (`/api/v1`), so `/api/v1/auth/login` is forwarded to the server unchanged. Adding a rewrite
    // here would double-apply the prefix.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
