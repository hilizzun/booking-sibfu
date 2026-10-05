/**
 * Файл календаря .ics: время встречи указано и в поясе гостя,
 * и в поясе организатора (PDR С5). Только текст, без внешних сервисов.
 */

import type { Booking } from './schemas.js';

/** Момент ISO в формат ICS: ГГГГММДДTHHММSSZ. */
function toIcsMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Неверный момент времени: ${iso}`);
  }
  const parts = date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return parts;
}

/** Сворачивает строку ICS по правилу 75 октетов: продолжение с пробела. */
function foldLine(line: string): string {
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function buildIcs(booking: Booking): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//booking-sibfu//booking//RU',
    'BEGIN:VEVENT',
    `UID:booking-${booking.id}@booking-sibfu`,
    `DTSTAMP:${toIcsMoment(booking.created_at)}`,
    `DTSTART:${toIcsMoment(booking.start)}`,
    `DTEND:${toIcsMoment(booking.end)}`,
    `SUMMARY:${escapeText(booking.meeting_type_name)}`,
    `DESCRIPTION:${escapeText(`Встреча в поясе организатора (${booking.time_zone}): ${booking.start}. Код доступа: запись открывается по ссылке-коду.`)}`,
    `LOCATION:${escapeText(`Пояс организатора: ${booking.time_zone}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
