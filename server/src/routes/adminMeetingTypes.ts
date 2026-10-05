import type { FastifyInstance } from 'fastify';

import { notImplemented } from '../errors.js';

/** Типы встреч и часы приёма в кабинете (С7, С14, С16, Q12). */
export function adminMeetingTypeRoutes(app: FastifyInstance): void {
  app.get('/admin/meeting-types', async () => notImplemented());
  app.post('/admin/meeting-types', async () => notImplemented());
  app.patch('/admin/meeting-types/:id', async () => notImplemented());
  app.delete('/admin/meeting-types/:id', async () => notImplemented());
}
