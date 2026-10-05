/**
 * Интеграция шага 4: гостевой путь и кабинет против живого приложения.
 * База в памяти, HTTP через app.inject. Главный кейс это двойная бронь:
 * два одинаковых запроса подряд дают одну запись 201 и один отказ 409 (С2).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';

const MONDAY = '2026-10-12';
const SLOT_START = '2026-10-12T07:00:00.000Z';

let app: FastifyInstance;

function seedMeetingType(): number {
  const created = app.db
    .prepare(
      `INSERT INTO meeting_types
         (name, duration_minutes, description, days_of_week, window_start, window_end, step_minutes, time_zone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      'Консультация',
      30,
      'Разбор вопросов',
      JSON.stringify(['mon', 'tue', 'wed', 'thu', 'fri']),
      '10:00:00',
      '12:00:00',
      30,
      'Europe/Moscow',
    ) as { id: number };
  return created.id;
}

function bookingPayload(meetingTypeId: number, guest: string) {
  return {
    meeting_type_id: meetingTypeId,
    start: SLOT_START,
    guest_name: guest,
    guest_email: `${guest}@example.com`,
  };
}

async function loginCookie(): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/admin/login',
    payload: { login: 'organizer', password: 'organizer' },
  });
  expect(login.statusCode).toBe(200);
  const setCookie = login.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);
  return cookie.split(';')[0];
}

beforeEach(() => {
  app = buildApp({ dbFile: ':memory:' });
});

afterEach(async () => {
  await app.close();
});

describe('двойная бронь одним слотом', () => {
  it('первый запрос 201, второй такой же 409', async () => {
    const meetingTypeId = seedMeetingType();

    const first = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: bookingPayload(meetingTypeId, 'ivan'),
    });
    expect(first.statusCode).toBe(201);
    const confirmation = first.json() as {
      booking: { id: number; start: string };
      access_code: string;
      calendar_url: string;
    };
    expect(confirmation.booking.start).toBe(SLOT_START);
    expect(confirmation.calendar_url).toBe(`/bookings/${confirmation.access_code}/calendar.ics`);

    const second = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: bookingPayload(meetingTypeId, 'petr'),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({
      code: 'slot_unavailable',
      message: 'Этот слот уже занят, выберите другое время',
    });

    const slots = await app.inject({
      method: 'GET',
      url: `/slots?meeting_type_id=${meetingTypeId}&date_from=${MONDAY}&date_to=${MONDAY}`,
    });
    const grid = slots.json() as Array<{ start: string; is_free: boolean }>;
    expect(grid.find((slot) => slot.start === SLOT_START)?.is_free).toBe(false);
  });

  it('пересечение неравных начал тоже отклоняется', async () => {
    const meetingTypeId = seedMeetingType();
    const first = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: bookingPayload(meetingTypeId, 'ivan'),
    });
    expect(first.statusCode).toBe(201);

    const overlap = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: { ...bookingPayload(meetingTypeId, 'petr'), start: '2026-10-12T07:15:00.000Z' },
    });
    expect(overlap.statusCode).toBe(409);
  });
});

describe('границы записи', () => {
  it('время не из сетки и прошедшее время дают отказ', async () => {
    const meetingTypeId = seedMeetingType();
    const offGrid = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: { ...bookingPayload(meetingTypeId, 'ivan'), start: '2026-10-12T07:15:00.000Z' },
    });
    expect(offGrid.statusCode).toBe(409);
    expect(offGrid.json().code).toBe('slot_unavailable');

    const past = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: { ...bookingPayload(meetingTypeId, 'ivan'), start: '2020-01-06T07:00:00.000Z' },
    });
    expect(past.statusCode).toBe(409);
  });

  it('неверные данные гостя отклоняются с пояснением', async () => {
    const meetingTypeId = seedMeetingType();
    const bad = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: {
        meeting_type_id: meetingTypeId,
        start: SLOT_START,
        guest_name: '',
        guest_email: 'not-an-email',
      },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('validation_failed');
  });

  it('нет такого типа встречи, ответ не найден', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: { ...bookingPayload(999999, 'ivan') },
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('встреча по ссылке-коду', () => {
  it('своя открывается, чужая нет, отмена освобождает слот', async () => {
    const meetingTypeId = seedMeetingType();
    const created = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: bookingPayload(meetingTypeId, 'ivan'),
    });
    const { access_code } = created.json() as { access_code: string };

    const own = await app.inject({ method: 'GET', url: `/bookings/${access_code}` });
    expect(own.statusCode).toBe(200);

    const alien = await app.inject({ method: 'GET', url: '/bookings/AAAAAAAAAAAAAAAAAAAAAA' });
    expect(alien.statusCode).toBe(404);
    expect(alien.json().code).toBe('not_found');

    const cancel = await app.inject({ method: 'POST', url: `/bookings/${access_code}/cancel` });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().status).toBe('cancelled');

    const again = await app.inject({ method: 'POST', url: `/bookings/${access_code}/cancel` });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('already_cancelled');

    const freed = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: bookingPayload(meetingTypeId, 'petr'),
    });
    expect(freed.statusCode).toBe(201);
  });

  it('календарь отдаётся как text/calendar', async () => {
    const meetingTypeId = seedMeetingType();
    const created = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: bookingPayload(meetingTypeId, 'ivan'),
    });
    const { access_code } = created.json() as { access_code: string };
    const calendar = await app.inject({
      method: 'GET',
      url: `/bookings/${access_code}/calendar.ics`,
    });
    expect(calendar.statusCode).toBe(200);
    expect(calendar.headers['content-type']).toContain('text/calendar');
    expect(calendar.body).toContain('BEGIN:VCALENDAR');
  });
});

describe('слоты и типы встреч', () => {
  it('гость видит типы, пустая сетка без часов это пустой список', async () => {
    const meetingTypeId = seedMeetingType();
    const types = await app.inject({ method: 'GET', url: '/meeting-types' });
    expect(types.statusCode).toBe(200);
    expect((types.json() as Array<{ id: number }>).some((row) => row.id === meetingTypeId)).toBe(
      true,
    );

    const bare = app.db
      .prepare(
        `INSERT INTO meeting_types (name, duration_minutes, description)
         VALUES (?, ?, ?) RETURNING id`,
      )
      .get('Без часов', 30, '') as { id: number };
    const empty = await app.inject({
      method: 'GET',
      url: `/slots?meeting_type_id=${bare.id}&date_from=${MONDAY}&date_to=${MONDAY}`,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual([]);
  });

  it('обратний диапазон и широкий диапазон отклоняются, чужой тип 404', async () => {
    const meetingTypeId = seedMeetingType();
    const reversed = await app.inject({
      method: 'GET',
      url: `/slots?meeting_type_id=${meetingTypeId}&date_from=2026-10-13&date_to=${MONDAY}`,
    });
    expect(reversed.statusCode).toBe(400);

    const wide = await app.inject({
      method: 'GET',
      url: `/slots?meeting_type_id=${meetingTypeId}&date_from=2026-10-01&date_to=2026-11-05`,
    });
    expect(wide.statusCode).toBe(400);

    const missing = await app.inject({
      method: 'GET',
      url: `/slots?meeting_type_id=999999&date_from=${MONDAY}&date_to=${MONDAY}`,
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('кабинет организатора', () => {
  it('без сессии кабинет закрыт, неверный пароль не пускает', async () => {
    const closed = await app.inject({ method: 'GET', url: '/admin/bookings' });
    expect(closed.statusCode).toBe(401);

    const wrong = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: { login: 'organizer', password: 'wrong' },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it('создать, поправить окно, занятый тип не удаляется', async () => {
    const cookie = await loginCookie();

    const created = await app.inject({
      method: 'POST',
      url: '/admin/meeting-types',
      headers: { cookie },
      payload: { name: 'Созвон', duration_minutes: 30, description: '' },
    });
    expect(created.statusCode).toBe(201);
    const typeId = (created.json() as { id: number }).id;

    const badWindow = await app.inject({
      method: 'PATCH',
      url: `/admin/meeting-types/${typeId}`,
      headers: { cookie },
      payload: {
        schedule: {
          days_of_week: ['mon'],
          start: '12:00:00',
          end: '10:00:00',
          step_minutes: 30,
          time_zone: 'Europe/Moscow',
        },
      },
    });
    expect(badWindow.statusCode).toBe(400);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/admin/meeting-types/${typeId}`,
      headers: { cookie },
      payload: {
        schedule: {
          days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
          start: '10:00:00',
          end: '12:00:00',
          step_minutes: 30,
          time_zone: 'Europe/Moscow',
        },
      },
    });
    expect(patched.statusCode).toBe(200);

    const booking = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: {
        meeting_type_id: typeId,
        start: SLOT_START,
        guest_name: 'Ivan',
        guest_email: 'ivan@example.com',
      },
    });
    expect(booking.statusCode).toBe(201);

    const inUse = await app.inject({
      method: 'DELETE',
      url: `/admin/meeting-types/${typeId}`,
      headers: { cookie },
    });
    expect(inUse.statusCode).toBe(409);
    expect(inUse.json().code).toBe('meeting_type_in_use');
  });

  it('список записей, отмена организатором и выход', async () => {
    const cookie = await loginCookie();
    const created = await app.inject({
      method: 'POST',
      url: '/admin/meeting-types',
      headers: { cookie },
      payload: { name: 'Созвон', duration_minutes: 30, description: '' },
    });
    const typeId = (created.json() as { id: number }).id;
    await app.inject({
      method: 'PATCH',
      url: `/admin/meeting-types/${typeId}`,
      headers: { cookie },
      payload: {
        schedule: {
          days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
          start: '10:00:00',
          end: '12:00:00',
          step_minutes: 30,
          time_zone: 'Europe/Moscow',
        },
      },
    });
    await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: {
        meeting_type_id: typeId,
        start: SLOT_START,
        guest_name: 'Ivan',
        guest_email: 'ivan@example.com',
      },
    });

    const listed = await app.inject({ method: 'GET', url: '/admin/bookings', headers: { cookie } });
    expect(listed.statusCode).toBe(200);
    const bookingId = (listed.json() as Array<{ id: number }>)[0].id;

    const cancel = await app.inject({
      method: 'POST',
      url: `/admin/bookings/${bookingId}/cancel`,
      headers: { cookie },
    });
    expect(cancel.statusCode).toBe(200);

    const again = await app.inject({
      method: 'POST',
      url: `/admin/bookings/${bookingId}/cancel`,
      headers: { cookie },
    });
    expect(again.statusCode).toBe(409);

    const logout = await app.inject({ method: 'POST', url: '/admin/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(204);
  });
});



