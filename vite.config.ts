
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react(), tailwindcss()],
  define: {
    'process.env.API_KEY': JSON.stringify("AIzaSyDsiZmigwNxdmb-6Yqpvi0ZHUv3gGYz12s"),
    'process.env.GEMINI_API_KEY': JSON.stringify("AIzaSyDsiZmigwNxdmb-6Yqpvi0ZHUv3gGYz12s")
  },
  resolve: {
    alias: {
      '@': path.resolve('./'),
    }
  }
});
