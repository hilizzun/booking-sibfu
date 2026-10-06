#!/usr/bin/env node
/**
 * Запускает API и web-preview одной командой. Используется из Playwright
 * webServer. Запускается без shell-обёртки, чтобы не зависеть от
 * квотирования путей на Windows.
 */

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

const dbFile = process.env.DB_FILE ?? 'server/test-e2e.db';
if (existsSync(dbFile)) {
  rmSync(dbFile);
  for (const ext of ['-shm', '-wal', '-journal']) {
    const f = dbFile + ext;
    if (existsSync(f)) rmSync(f);
  }
}

function run(name, cmd, args, extraEnv = {}) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv, E2E_ROOT: root },
    shell: false,
  });
  child.on('exit', (code, signal) => {
    console.error(`[${name}] exited code=${code} signal=${signal}`);
    process.exit(code ?? 1);
  });
  return child;
}

const api = run('api', 'node', [join(root, 'server', 'dist', 'index.js')], {
  PORT: process.env.PORT ?? '8000',
  HOST: process.env.HOST ?? '127.0.0.1',
  DB_FILE: dbFile,
  NODE_ENV: 'production',
});

const web = spawn(
  'node',
  [
    join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    'preview',
    '--config',
    join(root, 'web', 'vite.preview.config.ts'),
  ],
  {
    // Vite preview ищет `outDir` относительно `root`, а `root` берёт
    // по умолчанию из cwd. Поэтому для web устанавливаем cwd=web/,
    // и Vite находит web/dist.
    cwd: join(root, 'web'),
    stdio: 'inherit',
    env: { ...process.env },
    shell: false,
  },
);
console.error(`[start-e2e] root=${root}`);
web.on('exit', (code, signal) => {
  console.error(`[web] exited code=${code} signal=${signal}`);
  process.exit(code ?? 1);
});

// Завершаем обоих, если один упал.
api.on('exit', () => web.kill('SIGTERM'));
web.on('exit', () => api.kill('SIGTERM'));

const stop = () => {
  api.kill('SIGTERM');
  web.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
