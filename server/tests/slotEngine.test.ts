/**
 * Модульные тесты слотного движка: чистые функции без базы и HTTP.
 * Закрывают инварианты PDR: сетка из окна, слот целиком в окне,
 * запись закрывает пересекающееся время, прошлое отсекается.
 */

import { describe, expect, it } from 'vitest';

import {
  buildSlots,
  dayStarts,
  hasOverlap,
  isOverlapping,
  isPast,
  zoneDate,
  type GridInput,
  type TimeWindow,
} from '../src/slotEngine.js';

const WINDOW: TimeWindow = {
  days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
  start: '10:00:00',
  end: '12:00:00',
  step_minutes: 30,
  time_zone: 'Europe/Moscow',
};

/** Понедельник 2026-10-05 в Москве это UTC+3. */
const MONDAY = '2026-10-05';

function grid(overrides: Partial<GridInput> = {}) {
  return buildSlots({
    window: WINDOW,
    durationMinutes: 30,
    dateFrom: MONDAY,
    dateTo: MONDAY,
    occupied: [],
    ...overrides,
  });
}

describe('пересечения отрезков', () => {
  it('касание границами не считается пересечением', () => {
    const a = { start: new Date('2026-10-05T07:00:00Z'), end: new Date('2026-10-05T07:30:00Z') };
    const b = { start: new Date('2026-10-05T07:30:00Z'), end: new Date('2026-10-05T08:00:00Z') };
    expect(isOverlapping(a, b)).toBe(false);
    expect(hasOverlap(a, [b])).toBe(false);
  });

  it('общая минута уже пересечение, запись закрывает слот', () => {
    const slot = { start: new Date('2026-10-05T07:00:00Z'), end: new Date('2026-10-05T07:30:00Z') };
    const busy = { start: new Date('2026-10-05T07:15:00Z'), end: new Date('2026-10-05T07:45:00Z') };
    expect(isOverlapping(slot, busy)).toBe(true);
    expect(hasOverlap(slot, [busy])).toBe(true);
  });
});

describe('старты дня', () => {
  it('шаг 30 минут в окне 10:00,12:00 даёт четыре старта', () => {
    const starts = dayStarts(WINDOW, MONDAY, 30);
    expect(starts.map((date) => date.toISOString())).toEqual([
      '2026-10-05T07:00:00.000Z',
      '2026-10-05T07:30:00.000Z',
      '2026-10-05T08:00:00.000Z',
      '2026-10-05T08:30:00.000Z',
    ]);
  });

  it('слот, не помещающийся в окно целиком, не строится', () => {
    const starts = dayStarts({ ...WINDOW, end: '10:45:00' }, MONDAY, 60);
    expect(starts).toEqual([]);
  });

  it('длительность дольше окна даёт пустую сетку', () => {
    expect(grid({ durationMinutes: 180 })).toEqual([]);
  });
});

describe('сетка слотов', () => {
  it('вне дней приёма слотов нет', () => {
    expect(grid({ dateFrom: '2026-10-04', dateTo: '2026-10-04' })).toEqual([]);
  });

  it('действующая запись гасит пересекающиеся слоты, соседние свободны', () => {
    const slots = grid({
      occupied: [{ start: new Date('2026-10-05T07:00:00Z'), end: new Date('2026-10-05T07:30:00Z') }],
    });
    expect(slots.map((slot) => slot.is_free)).toEqual([false, true, true, true]);
  });

  it('запись другого типа тоже закрывает время (С9)', () => {
    const slots = grid({
      occupied: [{ start: new Date('2026-10-05T07:15:00Z'), end: new Date('2026-10-05T08:15:00Z') }],
    });
    expect(slots.map((slot) => slot.is_free)).toEqual([false, false, false, true]);
  });

  it('отменённая запись в занятости не передаётся, слот свободен', () => {
    expect(grid()[0].is_free).toBe(true);
  });
});

describe('прошедшее время', () => {
  it('слот, чьё начало наступило, считается прошедшим', () => {
    const slot = { start: new Date('2026-10-05T07:00:00Z'), end: new Date('2026-10-05T07:30:00Z') };
    expect(isPast(slot, new Date('2026-10-05T07:00:00Z'))).toBe(true);
    expect(isPast(slot, new Date('2026-10-05T06:59:59.999Z'))).toBe(false);
  });
});

describe('пояса и показ времени (С5, С15)', () => {
  it('один и тот же момент в поясе Москвы и в поясе гостя показывает разное, хранится одно', () => {
    // Слот 10:00 в Москве это 07:00 UTC. Гость в Новосибирске (+7) видит 14:00,
    // гость в Калининграде (+2) видит 09:00, хранится один момент UTC.
    const starts = dayStarts(WINDOW, MONDAY, 30);
    const first = starts[0];
    expect(first.toISOString()).toBe('2026-10-05T07:00:00.000Z');
    expect(zoneDate(first, 'Europe/Moscow')).toBe(MONDAY);
    expect(zoneDate(first, 'Asia/Novosibirsk')).toBe(MONDAY);
  });

  it('сетка строится в днях организатора, а не в днях гостя', () => {
    // Окно 00:30,01:30 во Владивостоке (+10) 2026-10-06 это ещё 2026-10-05 по UTC.
    // Дата диапазона это календарный день организатора, сетка не пустая.
    const window: TimeWindow = {
      days_of_week: ['tue'],
      start: '00:30:00',
      end: '01:30:00',
      step_minutes: 30,
      time_zone: 'Asia/Vladivostok',
    };
    const slots = buildSlots({
      window,
      durationMinutes: 30,
      dateFrom: '2026-10-06',
      dateTo: '2026-10-06',
      occupied: [],
    });
    expect(slots).toHaveLength(2);
    expect(slots[0].start.toISOString()).toBe('2026-10-05T14:30:00.000Z');
  });

  it('перевод часов не сдвигает слоты относительно окна (С15)', () => {
    // Нью-Йорк переходит на зимнее время 2026-11-01: окно 09:00,10:00
    // даёт старт 09:00 местного времени и до, и после перевода.
    const window: TimeWindow = {
      days_of_week: ['sun'],
      start: '09:00:00',
      end: '10:00:00',
      step_minutes: 30,
      time_zone: 'America/New_York',
    };
    const before = buildSlots({
      window,
      durationMinutes: 30,
      dateFrom: '2026-10-25',
      dateTo: '2026-10-25',
      occupied: [],
    });
    const after = buildSlots({
      window,
      durationMinutes: 30,
      dateFrom: '2026-11-01',
      dateTo: '2026-11-01',
      occupied: [],
    });
    expect(before.map((slot) => slot.start.toISOString())).toEqual([
      '2026-10-25T13:00:00.000Z',
      '2026-10-25T13:30:00.000Z',
    ]);
    // 1 ноября часы уже переведены: 09:00 EST это 14:00 UTC, а не 13:00.
    // Хранится другой момент, а местное время старта то же, относительно окна слоты не сдвинулись.
    expect(after.map((slot) => slot.start.toISOString())).toEqual([
      '2026-11-01T14:00:00.000Z',
      '2026-11-01T14:30:00.000Z',
    ]);
    // Смещение изменилось с UTC-4 на UTC-5, а местное время старта то же.
    expect(zoneDate(before[0].start, 'America/New_York')).toBe('2026-10-25');
    expect(zoneDate(after[0].start, 'America/New_York')).toBe('2026-11-01');
  });
});
