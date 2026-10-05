import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { badRequest, notFound } from '../errors.js';
import { buildSlots } from '../slotEngine.js';
import { findMeetingType, listActiveBookingsInRange } from '../store.js';

const slotsQuerySchema = z.object({
  meeting_type_id: z.coerce.number().int(),
  date_from: z.iso.date(),
  date_to: z.iso.date(),
});

/** Разница календарных дней: ширина диапазона не больше 31 дня (С13). */
function rangeWidthDays(from: string, to: string): number {
  const start = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Сетка слотов: свободные и занятые, даты в поясе организатора (С1, С13, С16). */
export function slotRoutes(app: FastifyInstance): void {
  app.get('/slots', async (request) => {
    const query = slotsQuerySchema.parse(request.query);
    if (query.date_from > query.date_to) {
      throw badRequest('validation_failed', 'Начало диапазона позже его конца');
    }
    if (rangeWidthDays(query.date_from, query.date_to) > 31) {
      throw badRequest('validation_failed', 'Диапазон дат не шире 31 дня');
    }
    const meetingType = findMeetingType(app.db, query.meeting_type_id);
    if (meetingType === undefined) {
      throw notFound('not_found', 'Такого типа встречи нет');
    }
    if (meetingType.schedule === undefined) {
      return [];
    }
    const occupied = listActiveBookingsInRange(
      app.db,
      `${query.date_from}T00:00:00.000Z`,
      `${query.date_to}T23:59:59.999Z`,
    ).map((row) => ({ start: new Date(row.startUtc), end: new Date(row.endUtc) }));
    return buildSlots({
      window: meetingType.schedule,
      durationMinutes: meetingType.duration_minutes,
      dateFrom: query.date_from,
      dateTo: query.date_to,
      occupied,
    }).map((slot) => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      is_free: slot.is_free,
    }));
  });
}

