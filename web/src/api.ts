/**
 * Обращения к API собраны в одном файле.
 * Типы повторяют модели контракта contract/main.tsp, своей предметной
 * логики здесь нет: интерфейс показывает то, что отдал сервер.
 */

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface Schedule {
  days_of_week: DayOfWeek[];
  start: string;
  end: string;
  step_minutes: number;
  time_zone: string;
}

export interface MeetingType {
  id: number;
  name: string;
  duration_minutes: number;
  description: string;
  schedule?: Schedule;
}

export interface Slot {
  start: string;
  end: string;
  is_free: boolean;
}

export type BookingStatus = 'active' | 'cancelled';

export interface Booking {
  id: number;
  meeting_type_id: number;
  meeting_type_name: string;
  start: string;
  end: string;
  time_zone: string;
  guest_name: string;
  guest_email: string;
  status: BookingStatus;
  created_at: string;
}

export interface BookingConfirmation {
  booking: Booking;
  access_code: string;
  calendar_url: string;
}

export interface ErrorBody {
  code:
    | 'validation_failed'
    | 'unauthorized'
    | 'not_found'
    | 'slot_unavailable'
    | 'already_cancelled'
    | 'meeting_type_in_use'
    | 'internal_error';
  message: string;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ErrorBody;

  constructor(status: number, body: ErrorBody) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // Заголовок Content-Type ставится только если есть тело: иначе Fastify
  // пытается разобрать пустое тело как JSON и отвечает 400 на запросы без
  // тела вроде POST /bookings/:code/cancel.
  const hasBody = init?.body !== undefined;
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (hasBody) {
    headers['Content-Type'] ??= 'application/json';
  }
  const response = await fetch(url, { ...init, headers });
  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
  let body: ErrorBody = { code: 'internal_error', message: 'Внутренняя ошибка сервиса' };
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    // Тело не разобралось, оставляем общий текст.
  }
  throw new ApiRequestError(response.status, body);
}

function slotsUrl(meetingTypeId: number, from: string, to: string): string {
  const params = new URLSearchParams({
    meeting_type_id: String(meetingTypeId),
    date_from: from,
    date_to: to,
  });
  return `/slots?${params.toString()}`;
}

/** Типы встреч для записи (С7, С10). */
export function fetchMeetingTypes(): Promise<MeetingType[]> {
  return request<MeetingType[]>('/meeting-types');
}

/** Слоты типа на диапазон дат в поясе организатора (С1, С10, С13, С16). */
export function fetchSlots(meetingTypeId: number, from: string, to: string): Promise<Slot[]> {
  return request<Slot[]>(slotsUrl(meetingTypeId, from, to));
}

export interface BookingCreate {
  meeting_type_id: number;
  start: string;
  guest_name: string;
  guest_email: string;
}

/** Запись гостя на свободный слот (С1, С2, С11, С12). */
export function createBooking(payload: BookingCreate): Promise<BookingConfirmation> {
  return request<BookingConfirmation>('/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Своя встреча по ссылке-коду (С4). */
export function fetchBooking(code: string): Promise<Booking> {
  return request<Booking>(`/bookings/${encodeURIComponent(code)}`);
}

/** Отмена встречи по ссылке-коду (С3). */
export function cancelBooking(code: string): Promise<Booking> {
  return request<Booking>(`/bookings/${encodeURIComponent(code)}/cancel`, { method: 'POST' });
}

/** Адрес файла календаря встречи (С5). */
export function calendarUrl(code: string): string {
  return `/bookings/${encodeURIComponent(code)}/calendar.ics`;
}

// ---------------------------------------------------------------------------
// Кабинет организатора
// ---------------------------------------------------------------------------

export interface LoginRequest {
  login: string;
  password: string;
}

/** Вход в кабинет: сервер ставит httpOnly-куку session (С6). */
export function adminLogin(payload: LoginRequest): Promise<void> {
  return request<void>('/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Выход: сервер гасит сессионную куку. */
export function adminLogout(): Promise<void> {
  return request<void>('/admin/logout', { method: 'POST' });
}

export interface MeetingTypeCreate {
  name: string;
  duration_minutes: number;
  description?: string;
  schedule?: Schedule;
}

export interface MeetingTypeUpdate {
  name?: string;
  duration_minutes?: number;
  description?: string;
  schedule?: Schedule;
}

/** Типы встреч в кабинете (С7). */
export function adminFetchMeetingTypes(): Promise<MeetingType[]> {
  return request<MeetingType[]>('/admin/meeting-types');
}

/** Создать тип встречи (С7). */
export function adminCreateMeetingType(payload: MeetingTypeCreate): Promise<MeetingType> {
  return request<MeetingType>('/admin/meeting-types', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Правка названия, длительности, описания или часов приёма (Q12). */
export function adminUpdateMeetingType(id: number, patch: MeetingTypeUpdate): Promise<MeetingType> {
  return request<MeetingType>(`/admin/meeting-types/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** Удалить тип встречи; 409 если есть записи. */
export function adminDeleteMeetingType(id: number): Promise<void> {
  return request<void>(`/admin/meeting-types/${id}`, { method: 'DELETE' });
}

/** Список записей в кабинете, новые сверху (С8, С17). */
export function adminFetchBookings(status?: BookingStatus): Promise<Booking[]> {
  const query = status === undefined ? '' : `?status=${encodeURIComponent(status)}`;
  return request<Booking[]>(`/admin/bookings${query}`);
}

/** Отмена записи организатором (С3, С8). */
export function adminCancelBooking(id: number): Promise<Booking> {
  return request<Booking>(`/admin/bookings/${id}/cancel`, { method: 'POST' });
}
