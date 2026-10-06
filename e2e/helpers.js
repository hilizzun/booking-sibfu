/**
 * Помощники для тестов: выбор будущего буднего дня в WeekBar, базовый URL API.
 * Скрывают локаль «Москва, шаг 30 мин, окно 10:00–12:00», заданные в fixtures.js.
 */

import { expect } from '@playwright/test';

import { MEETING_TYPE_NAME } from './fixtures.js';

const API = process.env.E2E_API_URL ?? 'http://localhost:8000';

function toDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Находит первый будний день в будущем, начиная с сегодня + 1.
 * Часы приёма заданы на Пн–Пт (fixtures.js), праздники не учитываем.
 */
export function firstFutureWeekday(now = new Date()) {
  const candidate = new Date(now);
  candidate.setDate(candidate.getDate() + 1);
  for (let i = 0; i < 7; i += 1) {
    const day = candidate.getDay();
    if (day !== 0 && day !== 6) {
      return toDateValue(candidate);
    }
    candidate.setDate(candidate.getDate() + 1);
  }
  throw new Error('Не нашлось буднего дня в пределах недели вперёд');
}

/** Открывает главную, выбирает тип «Консультация» и нужный день. */
export async function openGuestHome(page, day) {
  await page.goto('/');
  const option = page.getByRole('option', { name: new RegExp(MEETING_TYPE_NAME) });
  await expect(option).toBeVisible();
  await option.click();

  // WeekBar показывает 7 дней недели. Ищем кнопку с day-label равным ДД.ММ.
  const [, month, dayNum] = day.split('-');
  const label = `${Number(dayNum)}.${month}`;
  await page.locator('button.day', { hasText: label }).first().click();
}

export const API_BASE = API;
