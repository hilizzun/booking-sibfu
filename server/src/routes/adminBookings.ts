import type { FastifyInstance } from 'fastify';

import { notImplemented } from '../errors.js';

/** Список записей и отмена организатором (С3, С8, С17). */
export function adminBookingRoutes(app: FastifyInstance): void {
  app.get('/admin/bookings', async () => notImplemented());
  app.post('/admin/bookings/:id/cancel', async () => notImplemented());
}
