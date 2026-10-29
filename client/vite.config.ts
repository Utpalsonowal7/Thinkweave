import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // A different port would no longer match the API's trusted browser origin.
  server: { port: 5173, strictPort: true },
});
