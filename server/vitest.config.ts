import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Тесты обращаются к базе в оперативной памяти, окружение браузера не нужно.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
