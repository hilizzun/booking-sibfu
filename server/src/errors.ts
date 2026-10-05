/**
 * Ошибки API: код для программы, сообщение для человека.
 *
 * Клиент опирается на поле code, поле message показывают пользователю.
 * Набор кодов описан в контракте contract/main.tsp, union ErrorCode,
 * и синхронизирован с ним вручную (контракт правится раньше кода).
 */

import { ZodError } from 'zod';

export type ErrorCode =
  | 'validation_failed'
  | 'unauthorized'
  | 'not_found'
  | 'slot_unavailable'
  | 'already_cancelled'
  | 'meeting_type_in_use'
  | 'internal_error';

/** Тело ответа при ошибке. Совпадает с моделью ErrorBody из контракта. */
export interface ErrorBody {
  code: ErrorCode;
  message: string;
}

/**
 * Ошибка, которую сервис возвращает клиенту осознанно.
 * Всё остальное из обработчика считается сбоем и даёт 500.
 */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get body(): ErrorBody {
    return { code: this.code, message: this.message };
  }
}

export const badRequest = (code: ErrorCode, message: string): ApiError =>
  new ApiError(400, code, message);

export const unauthorized = (code: ErrorCode, message: string): ApiError =>
  new ApiError(401, code, message);

export const notFound = (code: ErrorCode, message: string): ApiError =>
  new ApiError(404, code, message);

export const conflict = (code: ErrorCode, message: string): ApiError =>
  new ApiError(409, code, message);

/**
 * Временная заглушка для этапа «скелет»: обработчики зарегистрированы,
 * чтобы тест соответствия контракту видел все маршруты, но логики пока нет.
 * Заменяется настоящим кодом на шаге 4 Design First.
 */
export const notImplemented = (): ApiError =>
  new ApiError(501, 'internal_error', 'Обработчик ещё не реализован');

/**
 * Превращает разбор Zod в одно понятное сообщение.
 * Пример: «guest_email: Неверный адрес почты; duration_minutes: ...».
 */
export function describeZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
