import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:4500', changeOrigin: true }
    },
    fs: {
      // el panel importa ../server/src/config/tracking-stages.js (una sola fuente)
      allow: ['..']
    }
  }
});
