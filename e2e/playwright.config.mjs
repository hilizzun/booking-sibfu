/**
 * Конфигурация e2e-тестов Playwright.
 *
 * Поднимает сразу два процесса:
 *   1) собранный сервер на 8000 с отдельной БД server/test-e2e.db;
 *   2) собранный web через `vite preview` на 5174 с проксированием /meeting-types,
 *      /slots, /bookings, /admin на сервер.
 *
 * baseURL тестов указывает на web (5174), потому что проверяем именно
 * сценарии в браузере. Если web не нужен, отдельные тесты могут ходить
 * на http://localhost:8000 напрямую через request.newContext().
 *
 * Файл .mjs: Playwright загружает конфиг через CJS-loader, и в нём нет
 * import.meta. ESM-импорты поддерживаются, если расширение .mjs.
 */

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8000;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: join(here, 'tests'),
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false, // общая БД, параллельные тесты будут конфликтовать
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  globalSetup: join(here, 'fixtures.js'),
  webServer: [
    {
      // Один webServer вместо двух: поднимает и API, и web-preview через
      // Node-обёртку, чтобы не зависеть от квотирования путей с пробелами
      // в shell на Windows. cwd принудительно ставим в корень проекта,
      // потому что Playwright ставит его в директорию конфига.
      cwd: join(here, '..'),
      // Абсолютный путь к Node-обёртке. Playwright на любой ОС запускает
      // `command` через свой shell: на Linux это /bin/sh -c, на Windows
      // cmd /c — без обёртки cmd /c ломается только ручной запуск из
      // PowerShell, который здесь не используется.
      command: `node ${JSON.stringify(join(here, 'start-e2e.js'))}`,
      env: {
        PORT: String(PORT),
        HOST: '127.0.0.1',
        // DB_FILE — путь относительно корня проекта, и сервер, и фикстура
        // сходятся на нём. Сервер (server/dist/index.js) открывает файл
        // через cwd, поэтому cwd webServer = корень проекта.
        DB_FILE: 'server/test-e2e.db',
        NODE_ENV: 'production',
      },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
