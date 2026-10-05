import type { FastifyInstance } from 'fastify';

import { notImplemented } from '../errors.js';

/**
 * Гостевые записи: создание (С1, С2, С11, С12), встреча по ссылке-коду (С4),
 * отмена (С3) и файл календаря (С5).
 */
export function bookingRoutes(app: FastifyInstance): void {
  app.post('/bookings', async () => notImplemented());
  app.get('/bookings/:code', async () => notImplemented());
  app.post('/bookings/:code/cancel', async () => notImplemented());
  app.get('/bookings/:code/calendar.ics', async () => notImplemented());
}
