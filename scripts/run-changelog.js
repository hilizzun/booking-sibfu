#!/usr/bin/env node
/**
 * Запускает scripts/changelog.sh через POSIX-sh.
 * Кросс-платформенно: находит sh на Linux/macOS как /bin/sh, на Windows — в
 * поставке Git for Windows. Команда «sh scripts/changelog.sh» из AGENTS.md
 * остаётся каноном; этот файл — только обёртка, чтобы не зависеть от того,
 * есть ли sh в PATH конкретного PowerShell/cmd.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'changelog.sh');

if (!existsSync(script)) {
  console.error(`Не найден ${script}`);
  process.exit(1);
}

/** Возвращает путь к POSIX-sh: Windows — Git for Windows, остальные — /bin/sh. */
function findShell() {
  if (process.platform === 'win32') {
    const candidates = [
      process.env.SHELL,
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\sh.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\usr\\bin\\sh.exe',
    ].filter(Boolean);
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    console.error('Не найден bash. Установите Git for Windows или добавьте SHELL в окружение.');
    process.exit(1);
  }
  return '/bin/sh';
}

const sh = findShell();
const result = spawnSync(sh, [script], { stdio: 'inherit' });
process.exit(result.status ?? 1);
