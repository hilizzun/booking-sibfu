/**
 * Глобальная подготовка для e2e: логинится как админ и заводит тип встречи
 * «Консультация» с часами приёма по будням 10:00–12:00 МСК шаг 30 мин.
 * Дальше тесты идут к web-интерфейсу как обычные гости.
 *
 * Делается на globalSetup, потому что все тесты делят одну БД (workers: 1)
 * и не должны повторно заполнять данные в каждом тесте.
 *
 * БД уже создана и пуста после start-e2e.js. Не удаляем файл здесь,
 * иначе собьём WAL/SHM, открытые сервером.
 *
 * Файл .js, потому что Playwright гоняет globalSetup через Node без
 * транспиляции TypeScript.
 */

import { request } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const API = process.env.E2E_API_URL ?? 'http://localhost:8000';
const DB_FILE = process.env.DB_FILE ?? join(process.cwd(), 'server', 'test-e2e.db');

const ADMIN_LOGIN = process.env.ORGANIZER_LOGIN ?? 'organizer';
const ADMIN_PASSWORD = process.env.ORGANIZER_PASSWORD ?? 'organizer';

const MEETING_TYPE_NAME = 'Консультация';
const MEETING_TYPE_DURATION = 30;

export { ADMIN_LOGIN, ADMIN_PASSWORD, MEETING_TYPE_NAME, MEETING_TYPE_DURATION };

export default async function globalSetup() {
  if (existsSync(DB_FILE) === false) {
    throw new Error(`Ожидалась БД ${DB_FILE}, но её нет. Возможно, сервер не стартовал.`);
  }

  const ctx = await request.newContext({ baseURL: API });

  let loggedIn = false;
  for (let attempt = 0; attempt < 20 && !loggedIn; attempt += 1) {
    const login = await ctx.post('/admin/login', {
      data: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD },
    });
    if (login.status() === 200) {
      loggedIn = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!loggedIn) {
    throw new Error(`Не удалось войти в кабинет под ${ADMIN_LOGIN} — сервер не поднялся или креды неверны.`);
  }

  const created = await ctx.post('/admin/meeting-types', {
    data: {
      name: MEETING_TYPE_NAME,
      duration_minutes: MEETING_TYPE_DURATION,
      description: 'Разбор вопросов',
    },
  });
  if (created.status() !== 201) {
    throw new Error(`Не удалось создать тип встречи: ${created.status()} ${await created.text()}`);
  }
  const meetingType = await created.json();

  const scheduled = await ctx.patch(`/admin/meeting-types/${meetingType.id}`, {
    data: {
      schedule: {
        days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
        start: '10:00:00',
        end: '12:00:00',
        step_minutes: 30,
        time_zone: 'Europe/Moscow',
      },
    },
  });
  if (scheduled.status() !== 200) {
    throw new Error(`Не удалось задать часы приёма: ${scheduled.status()} ${await scheduled.text()}`);
  }

  await ctx.dispose();
}
