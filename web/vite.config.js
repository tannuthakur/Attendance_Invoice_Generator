import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin calls in development; the API runs on :3000.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
