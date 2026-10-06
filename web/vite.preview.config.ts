import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Конфиг только для e2e: vite preview на 5174, с проксированием API
 * на собранный сервер (8000). В обычной разработке используется vite.config.ts
 * с портом 5173; здесь — отдельный конфиг, чтобы не ломать dev-режим
 * настройками, нужными только тестам.
 */
export default defineConfig({
  plugins: [react()],
  preview: {
    port: 5174,
    strictPort: false,
    proxy: {
      '/meeting-types': 'http://localhost:8000',
      '/slots': 'http://localhost:8000',
      '/bookings': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
    },
  },
});
