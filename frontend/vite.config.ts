import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The API is same-origin in production; in development Vite forwards it so cookies behave identically.
    proxy: { '/api': { target: 'http://127.0.0.1:8000' } },
  },
  build: { sourcemap: false, target: 'es2022' },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false },
});
