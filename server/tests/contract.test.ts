/**
 * Тест соответствия реализации контракту. Шаг 3 Design First (AGENTS, раздел 6).
 *
 * Источник истины — contract/openapi.yaml, собранный компилятором TypeSpec
 * из contract/main.tsp. Тест ничего не знает об обработчиках: он читает
 * контракт и требует, чтобы список маршрутов приложения совпал с ним
 * в обе стороны: лишний маршрут роняет тест, пропущенный тоже.
 *
 * Маршруты собираются теми же функциями, которыми их регистрирует
 * приложение: хук onRoute срабатывает на каждую регистрацию.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Fastify from 'fastify';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

import { registerRoutes } from '../src/routes/index.js';

interface Contract {
  paths: Record<string, Record<string, unknown>>;
}

const contractFile = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'contract',
  'openapi.yaml',
);
const contract = parseYaml(readFileSync(contractFile, 'utf8')) as Contract;

/** Методы, которые могут быть у операции в OpenAPI. */
const OPERATIONS = ['get', 'post', 'put', 'patch', 'delete'];

/** Путь контракта «/bookings/{code}» в вид Fastify «/bookings/:code». */
function toFastifyPath(contractPath: string): string {
  return contractPath.replace(/\{(\w+)\}/g, ':$1');
}

/** Все операции контракта в виде «МЕТОД путь». */
function contractOperations(): string[] {
  const operations: string[] = [];
  for (const [path, item] of Object.entries(contract.paths)) {
    for (const method of Object.keys(item)) {
      if (OPERATIONS.includes(method)) {
        operations.push(`${method.toUpperCase()} ${toFastifyPath(path)}`);
      }
    }
  }
  return operations.sort();
}

describe('реализация соответствует контракту', () => {
  it('в приложении ровно те эндпоинты, что описаны в контракте', async () => {
    const probe = Fastify();
    const registered: string[] = [];
    probe.addHook('onRoute', (route) => {
      // HEAD Fastify добавляет к каждому GET автоматически, в контракте его нет.
      if (route.method !== 'HEAD') {
        registered.push(`${route.method} ${route.url}`);
      }
    });
    registerRoutes(probe);
    await probe.close();

    // Дубликаты тоже считаем ошибкой: каждый маршрут регистрируется один раз.
    expect([...new Set(registered)].sort()).toEqual(contractOperations());
  });

  it('контракт собран из main.tsp и описывает OpenAPI 3.1', () => {
    const raw = readFileSync(contractFile, 'utf8');
    expect(raw.startsWith('openapi: 3.1.0')).toBe(true);
  });

  it('контракт объявляет обязательные параметры запроса слотов', () => {
    const slots = contract.paths['/slots'] as
      | { get?: { parameters?: Array<{ name: string; required?: boolean }> } }
      | undefined;
    const required = (slots?.get?.parameters ?? [])
      .filter((parameter) => parameter.required)
      .map((parameter) => parameter.name);
    expect(required.sort()).toEqual(['date_from', 'date_to', 'meeting_type_id']);
  });
});
