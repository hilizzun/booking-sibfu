import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/meeting-types': 'http://localhost:8000',
      '/slots': 'http://localhost:8000',
      '/bookings': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
    },
  },
});
