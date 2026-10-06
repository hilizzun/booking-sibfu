/**
 * Сборка приложения Fastify.
 *
 * buildApp возвращает готовый сервер, но не запускает его: тесты поднимают
 * приложение с базой в оперативной памяти и ходят в него через app.inject,
 * не занимая сетевой порт.
 */

import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
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
  /**
   * Папка со собранным интерфейсом (например, `web/dist`). Если передана
   * и существует на диске, сервер начнёт отдавать её как статику и
   * делать SPA-fallback на index.html. В dev-режиме и в тестах не задаётся.
   */
  webDir?: string;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const db = openDatabase(options.dbFile ?? ':memory:');
  ensureOrganizer(db);
  const app = Fastify({ logger: options.logger ?? false });

  app.decorate('db', db);

  // Пустое тело запроса для POST без параметров (например, отмена встречи
  // POST /bookings/:code/cancel) — норма. По умолчанию Fastify падает на пустом
  // JSON-теле, а POST без Content-Type отдаёт 415. Этот парсер принимает пустое
  // тело как «параметров нет» и не требует Content-Type для пустого POST.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      const text = typeof body === 'string' ? body : body.toString('utf-8');
      if (text.length === 0) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(text));
      } catch (error) {
        const parseError = error as Error & { statusCode?: number };
        parseError.statusCode = 400;
        done(parseError);
      }
    },
  );
  app.addContentTypeParser(
    '*',
    { parseAs: 'string' },
    (_request, body, done) => {
      const text = typeof body === 'string' ? body : body.toString('utf-8');
      if (text.length === 0) {
        done(null, undefined);
        return;
      }
      const unsupported = new Error(
        'Для этого Content-Type тело запроса не поддерживается',
      ) as Error & { statusCode?: number };
      unsupported.statusCode = 415;
      done(unsupported);
    },
  );

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

  // В проде: web собирается в web/dist и сервер отдаёт его как статику.
  // Маршруты API имеют приоритет: сначала зарегистрированные пути, потом статика.
  // Если webDir не передан или папки нет, статика не подключается —
  // это нормально для dev-режима и для модульных тестов.
  const webDir = options.webDir !== undefined ? resolve(options.webDir) : undefined;
  if (webDir !== undefined && existsSync(webDir)) {
    app.register(fastifyStatic, { root: webDir, prefix: '/', wildcard: false });
    // SPA-fallback: всё, что не поймали маршруты и не нашлось в статике,
    // отдаём index.html. Без этого обновление страницы по глубокой ссылке
    // падало бы в 404.
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const body: ErrorBody = { code: 'not_found', message: 'Такого эндпоинта нет' };
        return reply.code(404).send(body);
      }
      return reply.type('text/html').sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_request, reply) => {
      const body: ErrorBody = { code: 'not_found', message: 'Такого эндпоинта нет' };
      return reply.code(404).send(body);
    });
  }

  app.addHook('onClose', async () => {
    db.close();
  });

  return app;
}
