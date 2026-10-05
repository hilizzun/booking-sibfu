import type { FastifyInstance } from 'fastify';

import { notImplemented } from '../errors.js';

/** Сетка слотов: свободные и занятые, даты в поясе организатора (С1, С13, С16). */
export function slotRoutes(app: FastifyInstance): void {
  app.get('/slots', async () => notImplemented());
}
