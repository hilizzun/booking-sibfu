import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireSession } from '../auth.js';
import { conflict, notFound } from '../errors.js';
import { meetingTypeCreateSchema, meetingTypeUpdateSchema } from '../schemas.js';
import { listMeetingTypes, toMeetingType } from '../store.js';

const adminIdSchema = z.object({ id: z.coerce.number().int() });

function toScheduleColumns(schedule: { days_of_week: string[]; start: string; end: string; step_minutes: number; time_zone: string } | undefined) {
  if (schedule === undefined) {
    return {
      days_of_week: null,
      window_start: null,
      window_end: null,
      step_minutes: null,
      time_zone: null,
    };
  }
  return {
    days_of_week: JSON.stringify(schedule.days_of_week),
    window_start: schedule.start,
    window_end: schedule.end,
    step_minutes: schedule.step_minutes,
    time_zone: schedule.time_zone,
  };
}

/** Типы встреч и часы приёма в кабинете (С7, С14, С16, Q12). */
export function adminMeetingTypeRoutes(app: FastifyInstance): void {
  app.get('/admin/meeting-types', async (request) => {
    requireSession(app.db, request.headers.cookie);
    return listMeetingTypes(app.db);
  });

  app.post('/admin/meeting-types', async (request, reply) => {
    requireSession(app.db, request.headers.cookie);
    const body = meetingTypeCreateSchema.parse(request.body);
    const columns = toScheduleColumns(body.schedule);
    const created = app.db
      .prepare(
        `INSERT INTO meeting_types
           (name, duration_minutes, description, days_of_week, window_start, window_end, step_minutes, time_zone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(
        body.name,
        body.duration_minutes,
        body.description,
        columns.days_of_week,
        columns.window_start,
        columns.window_end,
        columns.step_minutes,
        columns.time_zone,
      );
    return reply.code(201).send(toMeetingType(created as Parameters<typeof toMeetingType>[0]));
  });

  app.patch('/admin/meeting-types/:id', async (request) => {
    requireSession(app.db, request.headers.cookie);
    const { id } = adminIdSchema.parse(request.params);
    const patch = meetingTypeUpdateSchema.parse(request.body);
    const existing = app.db.prepare('SELECT * FROM meeting_types WHERE id = ?').get(id);
    if (existing === undefined) {
      throw notFound('not_found', 'Такого типа встречи нет');
    }
    const columns = patch.schedule === undefined ? {} : toScheduleColumns(patch.schedule);
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) {
      fields.push('name = ?');
      values.push(patch.name);
    }
    if (patch.duration_minutes !== undefined) {
      fields.push('duration_minutes = ?');
      values.push(patch.duration_minutes);
    }
    if (patch.description !== undefined) {
      fields.push('description = ?');
      values.push(patch.description);
    }
    if (patch.schedule !== undefined) {
      fields.push('days_of_week = ?', 'window_start = ?', 'window_end = ?', 'step_minutes = ?', 'time_zone = ?');
      values.push(
        (columns as { days_of_week: unknown }).days_of_week,
        (columns as { window_start: unknown }).window_start,
        (columns as { window_end: unknown }).window_end,
        (columns as { step_minutes: unknown }).step_minutes,
        (columns as { time_zone: unknown }).time_zone,
      );
    }
    values.push(id);
    const updated = app.db
      .prepare(`UPDATE meeting_types SET ${fields.join(', ')} WHERE id = ? RETURNING *`)
      .get(...values);
    return toMeetingType(updated as Parameters<typeof toMeetingType>[0]);
  });

  app.delete('/admin/meeting-types/:id', async (request, reply) => {
    requireSession(app.db, request.headers.cookie);
    const { id } = adminIdSchema.parse(request.params);
    const existing = app.db.prepare('SELECT id FROM meeting_types WHERE id = ?').get(id);
    if (existing === undefined) {
      throw notFound('not_found', 'Такого типа встречи нет');
    }
    const used = app.db
      .prepare('SELECT id FROM bookings WHERE meeting_type_id = ? LIMIT 1')
      .get(id);
    if (used !== undefined) {
      throw conflict('meeting_type_in_use', 'На этот тип встречи есть записи, удалить его нельзя');
    }
    app.db.prepare('DELETE FROM meeting_types WHERE id = ?').run(id);
    return reply.code(204).send();
  });
}

