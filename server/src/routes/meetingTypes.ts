import type { FastifyInstance } from 'fastify';

import { notImplemented } from '../errors.js';

/** Гостевые типы встреч (С7, С10). */
export function meetingTypeRoutes(app: FastifyInstance): void {
  app.get('/meeting-types', async () => notImplemented());
}
