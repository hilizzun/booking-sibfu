/**
 * Слой хранения: чтение типов встреч и записей из SQLite.
 * Форматы хранения описаны в db.ts: моменты строками ISO-8601 в UTC,
 * окно строками ЧЧ:ММ:СС, дни недели JSON-массивом.
 */

import type { Db } from './db.js';
import type { Booking, BookingStatus, MeetingType, Schedule } from './schemas.js';

interface MeetingTypeRow {
  id: number;
  name: string;
  duration_minutes: number;
  description: string;
  days_of_week: string | null;
  window_start: string | null;
  window_end: string | null;
  step_minutes: number | null;
  time_zone: string | null;
}

interface BookingRow {
  id: number;
  meeting_type_id: number;
  meeting_type_name: string;
  start_utc: string;
  end_utc: string;
  time_zone: string;
  guest_name: string;
  guest_email: string;
  status: BookingStatus;
  access_code: string;
  created_at: string;
}

function toSchedule(row: MeetingTypeRow): Schedule | undefined {
  if (
    row.days_of_week === null ||
    row.window_start === null ||
    row.window_end === null ||
    row.step_minutes === null ||
    row.time_zone === null
  ) {
    return undefined;
  }
  return {
    days_of_week: JSON.parse(row.days_of_week),
    start: row.window_start,
    end: row.window_end,
    step_minutes: row.step_minutes,
    time_zone: row.time_zone,
  };
}

export function toMeetingType(row: MeetingTypeRow): MeetingType {
  const schedule = toSchedule(row);
  return schedule === undefined
    ? {
        id: row.id,
        name: row.name,
        duration_minutes: row.duration_minutes,
        description: row.description,
      }
    : {
        id: row.id,
        name: row.name,
        duration_minutes: row.duration_minutes,
        description: row.description,
        schedule,
      };
}

export function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    meeting_type_id: row.meeting_type_id,
    meeting_type_name: row.meeting_type_name,
    start: row.start_utc,
    end: row.end_utc,
    time_zone: row.time_zone,
    guest_name: row.guest_name,
    guest_email: row.guest_email,
    status: row.status,
    created_at: row.created_at,
  };
}

export function listMeetingTypes(db: Db): MeetingType[] {
  const rows = db.prepare('SELECT * FROM meeting_types ORDER BY id ASC').all() as MeetingTypeRow[];
  return rows.map(toMeetingType);
}

export function findMeetingType(db: Db, id: number): MeetingType | undefined {
  const row = db.prepare('SELECT * FROM meeting_types WHERE id = ?').get(id) as
    | MeetingTypeRow
    | undefined;
  return row === undefined ? undefined : toMeetingType(row);
}

/** Действующие записи, пересекающиеся с окном [from, to). */
export function listActiveBookingsInRange(
  db: Db,
  fromIso: string,
  toIso: string,
): Array<{ startUtc: string; endUtc: string }> {
  return db
    .prepare(
      `SELECT start_utc AS startUtc, end_utc AS endUtc FROM bookings
        WHERE status = 'active' AND start_utc < ? AND end_utc > ?
        ORDER BY start_utc ASC`,
    )
    .all(toIso, fromIso) as Array<{ startUtc: string; endUtc: string }>;
}

export function findBookingByCode(db: Db, code: string): (Booking & { accessCode: string }) | undefined {
  const row = db
    .prepare(
      `SELECT b.id, b.meeting_type_id, m.name AS meeting_type_name,
              b.start_utc, b.end_utc, b.time_zone,
              b.guest_name, b.guest_email, b.status,
              b.access_code, b.created_at
         FROM bookings b JOIN meeting_types m ON m.id = b.meeting_type_id
        WHERE b.access_code = ?`,
    )
    .get(code) as (BookingRow & { access_code: string }) | undefined;
  if (row === undefined) {
    return undefined;
  }
  return { ...toBooking(row), accessCode: row.access_code };
}

export function listBookings(db: Db, status: BookingStatus | undefined): Booking[] {
  const rows =
    status === undefined
      ? (db
          .prepare(
            `SELECT b.id, b.meeting_type_id, m.name AS meeting_type_name,
                    b.start_utc, b.end_utc, b.time_zone,
                    b.guest_name, b.guest_email, b.status,
                    b.access_code, b.created_at
               FROM bookings b JOIN meeting_types m ON m.id = b.meeting_type_id
              ORDER BY b.created_at DESC, b.id DESC`,
          )
          .all() as BookingRow[])
      : (db
          .prepare(
            `SELECT b.id, b.meeting_type_id, m.name AS meeting_type_name,
                    b.start_utc, b.end_utc, b.time_zone,
                    b.guest_name, b.guest_email, b.status,
                    b.access_code, b.created_at
               FROM bookings b JOIN meeting_types m ON m.id = b.meeting_type_id
              WHERE b.status = ? ORDER BY b.created_at DESC, b.id DESC`,
          )
          .all(status) as BookingRow[]);
  return rows.map(toBooking);
}

/** Отмена записи: необратима, повторная отмена отклоняется (С3). */
export function cancelBookingRow(
  db: Db,
  where: 'code' | 'id',
  value: string | number,
): Booking | 'missing' | 'already' {
  const condition = where === 'code' ? 'b.access_code = ?' : 'b.id = ?';
  const row = db
    .prepare(
      `SELECT b.id, b.meeting_type_id, m.name AS meeting_type_name,
              b.start_utc, b.end_utc, b.time_zone,
              b.guest_name, b.guest_email, b.status,
              b.access_code, b.created_at
         FROM bookings b JOIN meeting_types m ON m.id = b.meeting_type_id
        WHERE ${condition}`,
    )
    .get(value) as BookingRow | undefined;
  if (row === undefined) {
    return 'missing';
  }
  if (row.status === 'cancelled') {
    return 'already';
  }
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run('cancelled', row.id);
  const updated = db
    .prepare(
      `SELECT b.id, b.meeting_type_id, m.name AS meeting_type_name,
              b.start_utc, b.end_utc, b.time_zone,
              b.guest_name, b.guest_email, b.status,
              b.access_code, b.created_at
         FROM bookings b JOIN meeting_types m ON m.id = b.meeting_type_id
        WHERE b.id = ?`,
    )
    .get(row.id) as BookingRow;
  return toBooking(updated);
}
