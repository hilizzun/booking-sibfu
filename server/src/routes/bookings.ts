import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { bookingCreateSchema, type Booking, type BookingConfirmation } from '../schemas.js';
import { buildIcs } from '../ics.js';
import { buildSlots, hasOverlap, isPast, zoneDate } from '../slotEngine.js';
import { ApiError, badRequest, conflict, notFound } from '../errors.js';
import { cancelBookingRow, findBookingByCode, findMeetingType } from '../store.js';

/** Код доступа: 132 бита в base64url, вид из 22 знаков (С4). */
function newAccessCode(): string {
  return randomBytes(17).toString('base64url').slice(0, 22).padEnd(22, '0');
}

/** Проверка «свободно» первым рубежом: слот в сетке, время в будущем, нет пересечений. */
function assertSlotFree(
  app: FastifyInstance,
  meetingTypeId: number,
  schedule: NonNullable<Parameters<typeof buildSlots>[0]['window']>,
  durationMinutes: number,
  start: Date,
): void {
  void meetingTypeId;
  const wanted = { start, end: new Date(start.getTime() + durationMinutes * 60_000) };
  if (isPast(wanted, new Date())) {
    throw conflict('slot_unavailable', 'Это время уже прошло, выберите другой слот');
  }
  const occupied = app.db
    .prepare(
      `SELECT start_utc AS startUtc, end_utc AS endUtc FROM bookings
        WHERE status = 'active' AND start_utc < ? AND end_utc > ?`,
    )
    .all(wanted.end.toISOString(), wanted.start.toISOString()) as Array<{
    startUtc: string;
    endUtc: string;
  }>;
  if (
    hasOverlap(
      wanted,
      occupied.map((row) => ({ start: new Date(row.startUtc), end: new Date(row.endUtc) })),
    )
  ) {
    throw conflict('slot_unavailable', 'Этот слот уже занят, выберите другое время');
  }
  const day = zoneDate(start, schedule.time_zone);
  const grid = buildSlots({ window: schedule, durationMinutes, dateFrom: day, dateTo: day, occupied: [] });
  if (!grid.some((slot) => slot.start.getTime() === start.getTime())) {
    throw conflict('slot_unavailable', 'Такого слота нет в сетке, выберите время из списка');
  }
}

/**
 * Гостевые записи: создание (С1, С2, С11, С12), встреча по ссылке-коду (С4),
 * отмена (С3) и файл календаря (С5).
 */
export function bookingRoutes(app: FastifyInstance): void {
  app.post('/bookings', async (request, reply) => {
    const body = bookingCreateSchema.parse(request.body);
    const meetingType = findMeetingType(app.db, body.meeting_type_id);
    if (meetingType === undefined) {
      throw notFound('not_found', 'Такого типа встречи нет');
    }
    if (meetingType.schedule === undefined) {
      throw conflict('slot_unavailable', 'У этого типа встречи нет часов приёма');
    }
    const start = new Date(body.start);
    if (Number.isNaN(start.getTime())) {
      throw badRequest('validation_failed', 'Неверное время начала');
    }
    assertSlotFree(app, meetingType.id, meetingType.schedule, meetingType.duration_minutes, start);

    const end = new Date(start.getTime() + meetingType.duration_minutes * 60_000);
    const accessCode = newAccessCode();
    const createdAt = new Date().toISOString();
    try {
      app.db.exec('BEGIN IMMEDIATE');
      // Повторная проверка внутри транзакции закрывает щель гонки:
      // вторая запись ждёт BEGIN IMMEDIATE и видит первую (С2).
      assertSlotFree(app, meetingType.id, meetingType.schedule, meetingType.duration_minutes, start);
      app.db
        .prepare(
          `INSERT INTO bookings
             (meeting_type_id, start_utc, end_utc, time_zone, guest_name, guest_email, status, access_code, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        )
        .run(
          meetingType.id,
          start.toISOString(),
          end.toISOString(),
          meetingType.schedule.time_zone,
          body.guest_name,
          body.guest_email,
          accessCode,
          createdAt,
        );
      app.db.exec('COMMIT');
    } catch (error) {
      try {
        app.db.exec('ROLLBACK');
      } catch {
        // Соединение уже вне транзакции, откатывать нечего.
      }
      if (error instanceof ApiError) {
        throw error;
      }
      if (error instanceof Error && /BOOKING_OVERLAP|UNIQUE constraint failed/i.test(error.message)) {
        throw conflict('slot_unavailable', 'Этот слот уже занят, выберите другое время');
      }
      throw error;
    }
    const row = findBookingByCode(app.db, accessCode);
    if (row === undefined) {
      throw conflict('slot_unavailable', 'Запись не создана, повторите попытку');
    }
    const { accessCode: _ignored, ...booking } = row;
    const bookingBody: Booking = booking;
    const confirmation: BookingConfirmation = {
      booking: bookingBody,
      access_code: accessCode,
      calendar_url: `/bookings/${accessCode}/calendar.ics`,
    };
    return reply.code(201).send(confirmation);
  });

  app.get('/bookings/:code', async (request) => {
    const { code } = request.params as { code: string };
    const row = findBookingByCode(app.db, code);
    if (row === undefined) {
      throw notFound('not_found', 'Такой встречи нет, проверьте ссылку-код');
    }
    const { accessCode: _ignored, ...booking } = row;
    return booking;
  });

  app.post('/bookings/:code/cancel', async (request) => {
    const { code } = request.params as { code: string };
    const result = cancelBookingRow(app.db, 'code', code);
    if (result === 'missing') {
      throw notFound('not_found', 'Такой встречи нет, проверьте ссылку-код');
    }
    if (result === 'already') {
      throw conflict('already_cancelled', 'Запись уже отменена, отменять больше нечего');
    }
    return result;
  });

  app.get('/bookings/:code/calendar.ics', async (request, reply) => {
    const { code } = request.params as { code: string };
    const row = findBookingByCode(app.db, code);
    if (row === undefined) {
      throw notFound('not_found', 'Такой встречи нет, проверьте ссылку-код');
    }
    const { accessCode: _ignored, ...booking } = row;
    return reply.header('Content-Type', 'text/calendar; charset=utf-8').send(buildIcs(booking));
  });
}
