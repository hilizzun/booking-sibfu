import type { FastifyInstance } from 'fastify';

import { notImplemented } from '../errors.js';

/** Вход и выход из кабинета (С6): кука session выдаётся при входе (Q2). */
export function adminAuthRoutes(app: FastifyInstance): void {
  app.post('/admin/login', async () => notImplemented());
  app.post('/admin/logout', async () => notImplemented());
}
