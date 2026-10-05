/**
 * Схемы Zod: одна в одну модели контракта contract/main.tsp.
 *
 * Это граница сервиса: каждый обработчик начинается с schema.parse
 * (AGENTS, раздел 7). Типы предметной области выводятся через z.infer.
 * Кросс-проверки, которых не выражить в схеме (предел ширины диапазона
 * дат, попадание времени в сетку), живут в обработчиках.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Часы приёма
// ---------------------------------------------------------------------------

/** День недели: union DayOfWeek из контракта. */
export const dayOfWeekSchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

/** Часы приёма: модель Schedule из контракта. Начало окна раньше конца (С14). */
export const scheduleSchema = z
  .object({
    days_of_week: z.array(dayOfWeekSchema).min(1).max(7),
    start: z.iso.time(),
    end: z.iso.time(),
    step_minutes: z.int().min(1).max(720),
    time_zone: z.string().regex(/^[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+){1,2}$/),
  })
  .refine((schedule) => schedule.start < schedule.end, {
    message: 'Начало рабочего окна должно быть раньше его конца',
  });

// ---------------------------------------------------------------------------
// Тип встречи
// ---------------------------------------------------------------------------

/** Модель MeetingType из контракта. */
export const meetingTypeSchema = z.object({
  id: z.int(),
  name: z.string().min(1).max(100),
  duration_minutes: z.int().min(5).max(1440),
  description: z.string().max(500),
  schedule: scheduleSchema.optional(),
});

/** Модель MeetingTypeCreate из контракта. */
export const meetingTypeCreateSchema = z.object({
  name: z.string().min(1).max(100),
  duration_minutes: z.int().min(5).max(1440),
  description: z.string().max(500).default(''),
  schedule: scheduleSchema.optional(),
});

/** Модель MeetingTypeUpdate из контракта: меняются только переданные поля. */
export const meetingTypeUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    duration_minutes: z.int().min(5).max(1440).optional(),
    description: z.string().max(500).optional(),
    schedule: scheduleSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Пустое тело правки: нечего менять',
  });

// ---------------------------------------------------------------------------
// Слот
// ---------------------------------------------------------------------------

/** Модель Slot из контракта: моменты UTC, слот считается на лету (ADR-0001). */
export const slotSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  is_free: z.boolean(),
});

// ---------------------------------------------------------------------------
// Запись
// ---------------------------------------------------------------------------

/** Union BookingStatus из контракта. */
export const bookingStatusSchema = z.enum(['active', 'cancelled']);

/** Модель Booking из контракта. */
export const bookingSchema = z.object({
  id: z.int(),
  meeting_type_id: z.int(),
  meeting_type_name: z.string(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  time_zone: z.string(),
  guest_name: z.string().min(1).max(100),
  guest_email: z.email(),
  status: bookingStatusSchema,
  created_at: z.iso.datetime(),
});

/** Модель BookingCreate из контракта (С1, С11, С12). */
export const bookingCreateSchema = z.object({
  meeting_type_id: z.int(),
  start: z.iso.datetime(),
  guest_name: z.string().min(1).max(100),
  guest_email: z.email(),
});

/** Модель BookingConfirmation из контракта: подтверждение на экране (С1). */
export const bookingConfirmationSchema = z.object({
  booking: bookingSchema,
  access_code: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  calendar_url: z.string(),
});

// ---------------------------------------------------------------------------
// Вход в кабинет
// ---------------------------------------------------------------------------

/** Модель LoginRequest из контракта (С6). */
export const loginRequestSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Вывод типов
// ---------------------------------------------------------------------------

export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type MeetingType = z.infer<typeof meetingTypeSchema>;
export type MeetingTypeCreate = z.infer<typeof meetingTypeCreateSchema>;
export type MeetingTypeUpdate = z.infer<typeof meetingTypeUpdateSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type Booking = z.infer<typeof bookingSchema>;
export type BookingCreate = z.infer<typeof bookingCreateSchema>;
export type BookingConfirmation = z.infer<typeof bookingConfirmationSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
