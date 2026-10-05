/**
 * Слотный движок: чистые функции вычисления сетки слотов.
 *
 * Никакой базы и HTTP здесь нет: часы приёма и записи приходят параметрами
 * (AGENTS, раздел 7). Слот не хранится, он производная расписания (ADR-0001).
 *
 * Соглашения:
 *   - даты вида ГГГГ-ММ-ДД это календарные дни в поясе организатора;
 *   - окно (start, end) это местное время этого пояса, ЧЧ:ММ:СС;
 *   - наружу отдаются моменты UTC (Date), переводом занимается только это место;
 *   - слот строится, только если он целиком помещается в рабочее окно
 *     (решение Q11 этапа спецификации).
 */

import type { DayOfWeek } from './schemas.js';

/** Часы приёма, которые получает движок. */
export interface TimeWindow {
  days_of_week: readonly DayOfWeek[];
  start: string;
  end: string;
  step_minutes: number;
  time_zone: string;
}

/** Отрезок времени. */
export interface Interval {
  start: Date;
  end: Date;
}

/** Слот с признаком занятости действующей записью. */
export interface FreeSlot extends Interval {
  is_free: boolean;
}

const WEEKDAY_BY_INDEX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const WEEKDAY_BY_NAME: Record<string, DayOfWeek> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

/** Разбирает ЧЧ:ММ:СС в секунды суток. */
function secondsOfDay(time: string): number {
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + (seconds ?? 0);
}

/** День недели календарной даты: сама дата уже заявлена в поясе организатора. */
function weekdayOfDate(date: string): DayOfWeek {
  const [year, month, day] = date.split('-').map(Number);
  const index = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAY_BY_INDEX[index];
}

/** Добавляет к строке даты n суток. */
function addDays(date: string, n: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + n));
  return shifted.toISOString().slice(0, 10);
}

/** Компоненты момента в заданном поясе. */
function partsInZone(date: Date, timeZone: string): {
  date: string;
  seconds: number;
  weekday: DayOfWeek;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  // В некоторых сборках ICU полночь отдаётся как «24».
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    seconds: Number(hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
    weekday: WEEKDAY_BY_NAME[parts.weekday],
  };
}

/** Смещение пояса в миллисекундах на данный момент. */
function zoneOffsetMs(timestamp: number, timeZone: string): number {
  const parts = partsInZone(new Date(timestamp), timeZone);
  const [year, month, day] = parts.date.split('-').map(Number);
  const asUtc = Date.UTC(year, month - 1, day, 0, 0, 0) + parts.seconds * 1000;
  return asUtc - timestamp;
}

/**
 * Местное время пояса (ГГГГ-ММ-ДД, ЧЧ:ММ:СС) в момент UTC.
 * Двухпроходная догадка нужна, чтобы корректно пережить перевод часов.
 */
function wallTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0) + secondsOfDay(time) * 1000;
  const first = guess - zoneOffsetMs(guess, timeZone);
  const second = guess - zoneOffsetMs(first, timeZone);
  return new Date(first === second ? first : second);
}

/** Вход расчёта сетки: окно, длительность, диапазон, занятости. */
export interface GridInput {
  window: TimeWindow;
  durationMinutes: number;
  dateFrom: string;
  dateTo: string;
  occupied: readonly Interval[];
}

/** Строит слот из начала: конец это старт плюс длительность. */
function buildSlot(start: Date, durationMinutes: number, occupied: readonly Interval[]): FreeSlot {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { start, end, is_free: !hasOverlap({ start, end }, occupied) };
}

/**
 * Старты дня: шаг от начала окна, слот целиком внутри окна.
 * Окно полуоткрытое [start, end): конец слота не позже конца окна.
 */
export function dayStarts(window: TimeWindow, date: string, durationMinutes: number): Date[] {
  const windowSeconds = secondsOfDay(window.end) - secondsOfDay(window.start);
  const durationSeconds = durationMinutes * 60;
  if (windowSeconds < durationSeconds) {
    return [];
  }
  const starts: Date[] = [];
  const stepSeconds = window.step_minutes * 60;
  const windowStart = secondsOfDay(window.start);
  for (
    let offset = 0;
    offset + durationSeconds <= windowSeconds;
    offset += stepSeconds
  ) {
    const atSeconds = windowStart + offset;
    const hours = Math.floor(atSeconds / 3600);
    const minutes = Math.floor((atSeconds % 3600) / 60);
    const seconds = atSeconds % 60;
    const time = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
    starts.push(wallTimeToUtc(date, time, window.time_zone));
  }
  return starts;
}

/**
 * Сетка слотов на диапазон дат в поясе организатора.
 * Чистая функция: база и HTTP сюда не заходят.
 * Прошедшие слоты возвращаются как есть, отсекает их вызывающий код.
 */
export function buildSlots(input: GridInput): FreeSlot[] {
  const { window, durationMinutes, dateFrom, dateTo, occupied } = input;
  const slots: FreeSlot[] = [];
  for (let date = dateFrom; date <= dateTo; date = addDays(date, 1)) {
    if (!window.days_of_week.includes(weekdayOfDate(date))) {
      continue;
    }
    for (const start of dayStarts(window, date, durationMinutes)) {
      slots.push(buildSlot(start, durationMinutes, occupied));
    }
  }
  slots.sort((a, b) => a.start.getTime() - b.start.getTime());
  return slots;
}

/** Календарная дата момента в заданном поясе. */
export function zoneDate(date: Date, timeZone: string): string {
  return partsInZone(date, timeZone).date;
}

/** Два отрезка пересекаются, если их общая длина положительна. */
export function isOverlapping(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Пересекается ли отрезок с хоть одной занятостью. */
export function hasOverlap(slot: Interval, occupied: readonly Interval[]): boolean {
  return occupied.some((other) => isOverlapping(slot, other));
}

/** Наступило ли время старта: начало слота не позже текущего момента. */
export function isPast(slot: Interval, now: Date): boolean {
  return slot.start.getTime() <= now.getTime();
}
