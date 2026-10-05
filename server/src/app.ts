/**
 * Сборка приложения Fastify.
 *
 * buildApp возвращает готовый сервер, но не запускает его: тесты поднимают
 * приложение с базой в оперативной памяти и ходят в него через app.inject,
 * не занимая сетевой порт.
 */

import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { openDatabase, type Db } from './db.js';
import { ensureOrganizer } from './auth.js';
import { ApiError, describeZodError, type ErrorBody } from './errors.js';
import { registerRoutes } from './routes/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Открытая база данных. Живёт ровно столько, сколько живёт приложение. */
    db: Db;
  }
}

export interface AppOptions {
  /** Файл базы данных. ':memory:' (по умолчанию) даёт базу в памяти. */
  dbFile?: string;
  /** Писать ли журнал запросов. В тестах не нужен. */
  logger?: boolean;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const db = openDatabase(options.dbFile ?? ':memory:');
  ensureOrganizer(db);
  const app = Fastify({ logger: options.logger ?? false });

  app.decorate('db', db);

  // Единая обработка ошибок: в обработчике достаточно бросить ApiError
  // или не пройти schema.parse, а превращение в ответ {code, message}
  // происходит здесь, один раз (контракт: ErrorBody).
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send(error.body);
    }

    if (error instanceof ZodError) {
      const body: ErrorBody = { code: 'validation_failed', message: describeZodError(error) };
      return reply.code(400).send(body);
    }

    // Fastify сам бросает 400, если тело запроса не разобралось как JSON.
    if (error.statusCode === 400) {
      const body: ErrorBody = {
        code: 'validation_failed',
        message: 'Тело запроса не является корректным JSON',
      };
      return reply.code(400).send(body);
    }

    // Всё остальное это сбой. Подробности в журнал, наружу общий текст.
    request.log.error(error);
    const body: ErrorBody = { code: 'internal_error', message: 'Внутренняя ошибка сервиса' };
    return reply.code(500).send(body);
  });

  registerRoutes(app);

  app.setNotFoundHandler((_request, reply) => {
    const body: ErrorBody = { code: 'not_found', message: 'Такого эндпоинта нет' };
    return reply.code(404).send(body);
  });

  app.addHook('onClose', async () => {
    db.close();
  });

  return app;
}
