import type { FastifyInstance } from 'fastify';

import { listMeetingTypes } from '../store.js';

/** Гостевые типы встреч (С7, С10). */
export function meetingTypeRoutes(app: FastifyInstance): void {
  app.get('/meeting-types', async () => listMeetingTypes(app.db));
}

