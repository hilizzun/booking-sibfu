/**
 * Точка входа сервиса. Порт берётся из PORT (по умолчанию 8000),
 * файл базы из DB_FILE (по умолчанию booking.db).
 *
 * В проде сервер отдаёт и API, и собранный web/dist. В dev-режиме
 * web запускается отдельной командой (`npm run dev:web`) и работает
 * через Vite, в этом случае папку с собранным интерфейсом указывать
 * не нужно.
 */

import { buildApp } from './app.js';
import { ensureOrganizer } from './auth.js';

const port = Number(process.env.PORT ?? 8000);
const host = process.env.HOST ?? '0.0.0.0';

const app = buildApp({
  dbFile: process.env.DB_FILE ?? 'booking.db',
  logger: true,
  webDir: process.env.WEB_DIR,
});

ensureOrganizer(app.db);

await app.listen({ port, host });
