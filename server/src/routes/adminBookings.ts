import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireSession } from '../auth.js';
import { conflict, notFound } from '../errors.js';
import { bookingStatusSchema } from '../schemas.js';
import { cancelBookingRow, listBookings } from '../store.js';

const adminBookingsQuerySchema = z.object({ status: bookingStatusSchema.optional() });
const adminBookingIdSchema = z.object({ id: z.coerce.number().int() });

/** Список записей и отмена организатором (С3, С8, С17). */
export function adminBookingRoutes(app: FastifyInstance): void {
  app.get('/admin/bookings', async (request) => {
    requireSession(app.db, request.headers.cookie);
    const query = adminBookingsQuerySchema.parse(request.query);
    return listBookings(app.db, query.status);
  });

  app.post('/admin/bookings/:id/cancel', async (request) => {
    requireSession(app.db, request.headers.cookie);
    const { id } = adminBookingIdSchema.parse(request.params);
    const result = cancelBookingRow(app.db, 'id', id);
    if (result === 'missing') {
      throw notFound('not_found', 'Такой записи нет');
    }
    if (result === 'already') {
      throw conflict('already_cancelled', 'Запись уже отменена, отменять больше нечего');
    }
    return result;
  });
}

