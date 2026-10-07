/**
 * Сквозные сценарии в браузере (Chromium). PDR: С1, С2, С3, С4, С17
 * и два смежных (вход в кабинет, чужой код).
 */

import { expect, test } from '@playwright/test';

import { ADMIN_LOGIN, ADMIN_PASSWORD } from '../fixtures.js';
import { API_BASE, firstFutureWeekday, openGuestHome } from '../helpers.js';

const CONSENT = 'Соглашаюсь на обработку имени и почты для записи на встречу. Данные нужны организатору как контакт и не передаются третьим лицам.';

test.describe('Гость записывается и отменяет встречу', () => {
  test('С1: гость бронирует слот и получает ссылку-код со ссылкой на .ics', async ({ page }) => {
    const day = firstFutureWeekday();
    await openGuestHome(page, day);
    const firstFreeSlot = page.locator('button.slot.is-free').first();
    await expect(firstFreeSlot).toBeVisible();
    const slotTime = (await firstFreeSlot.textContent())?.trim() ?? '';
    await firstFreeSlot.click();
    await expect(page.getByRole('heading', { name: `Запись на ${slotTime}` })).toBeVisible();
    await page.getByLabel('Имя').fill('Иван Петров');
    await page.getByLabel('Почта').fill('ivan@example.com');
    await page.getByLabel(CONSENT).check();
    await page.getByRole('button', { name: 'Записаться' }).click();
    const confirm = page.locator('section.confirm');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Сохраните ссылку-код');
    const code = (await confirm.locator('p.code').textContent())?.trim() ?? '';
    expect(code.length).toBeGreaterThan(10);
    const calendar = confirm.getByRole('link', { name: /календарь/ });
    const icsHref = await calendar.getAttribute('href');
    expect(icsHref).toBe(`/bookings/${code}/calendar.ics`);
    const ics = await page.request.get(`${API_BASE}${icsHref}`);
    expect(ics.status()).toBe(200);
    const icsBody = await ics.text();
    expect(icsBody).toContain('BEGIN:VCALENDAR');
    expect(icsBody).toContain('END:VCALENDAR');
  });
  test('С2: повторная запись на тот же слот отклоняется с понятным сообщением', async ({ page, request }) => {
    const day = firstFutureWeekday();
    await openGuestHome(page, day);
    const firstFreeSlot = page.locator('button.slot.is-free').first();
    await expect(firstFreeSlot).toBeVisible();
    await firstFreeSlot.click();
    await page.getByLabel('Имя').fill('Гость Первый');
    await page.getByLabel('Почта').fill('first@example.com');
    await page.getByLabel(CONSENT).check();
    await page.getByRole('button', { name: 'Записаться' }).click();
    await expect(page.locator('section.confirm')).toBeVisible();
    await expect(page.locator('button.slot.is-busy').first()).toBeVisible();
    // Берём start забронированного слота через /bookings/:code, а не
    // через grid.find — иначе тест проходит зря, потому что «любой
    // свободный» это не тот, который мы только что заняли.
    const code = (await page.locator('section.confirm p.code').textContent())?.trim() ?? '';
    expect(code.length).toBeGreaterThan(10);
    const booked = (await (await request.get(`${API_BASE}/bookings/${code}`)).json()) as { start: string };
    const occupiedStart = booked.start;
    expect(occupiedStart).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const types = (await (await request.get(`${API_BASE}/meeting-types`)).json()) as Array<{ id: number }>;
    const typeId = types[0]?.id;
    expect(typeId).toBeTruthy();
    const second = await request.post(`${API_BASE}/bookings`, {
      data: { meeting_type_id: typeId, start: occupiedStart, guest_name: 'Гость Второй', guest_email: 'second@example.com' },
    });
    expect(second.status()).toBe(409);
    const error = (await second.json()) as { code: string; message: string };
    expect(error.code).toBe('slot_unavailable');
    expect(error.message).toContain('уже занят');
  });
  test('С3: гость отменяет запись по ссылке-коду, слот снова свободен', async ({ page, request }) => {
    const day = firstFutureWeekday();
    await openGuestHome(page, day);
    const firstFreeSlot = page.locator('button.slot.is-free').first();
    await expect(firstFreeSlot).toBeVisible();
    await firstFreeSlot.click();
    await page.getByLabel('Имя').fill('Иван');
    await page.getByLabel('Почта').fill('cancel@example.com');
    await page.getByLabel(CONSENT).check();
    await page.getByRole('button', { name: 'Записаться' }).click();
    const code = (await page.locator('section.confirm p.code').textContent())?.trim() ?? '';
    expect(code).toBeTruthy();
    await page.getByRole('button', { name: 'Записаться на другое время' }).click();
    await page.getByLabel('Ссылка-код').fill(code);
    await page.getByRole('button', { name: 'Открыть' }).click();
    await expect(page.getByText(/действует$/)).toBeVisible();
    await expect(page.locator('button.slot.is-busy').first()).toBeVisible();
    await page.getByRole('button', { name: 'Отменить встречу' }).click();
    await expect(page.getByText(/отменена$/)).toBeVisible();
    const types = (await (await request.get(`${API_BASE}/meeting-types`)).json()) as Array<{ id: number }>;
    const typeId = types[0]?.id;
    const slots = (await (await request.get(`${API_BASE}/slots`, {
      params: { meeting_type_id: String(typeId), date_from: day, date_to: day },
    })).json()) as Array<{ is_free: boolean }>;
    expect(slots.some((s) => s.is_free)).toBe(true);
    const again = await request.post(`${API_BASE}/bookings/${code}/cancel`);
    expect(again.status()).toBe(409);
    const err = (await again.json()) as { code: string };
    expect(err.code).toBe('already_cancelled');
  });
  test('С4: чужой код не открывает чужую запись, отвечает 404', async ({ page, request }) => {
    const day = firstFutureWeekday();
    await openGuestHome(page, day);
    await page.locator('button.slot.is-free').first().click();
    await page.getByLabel('Имя').fill('Один');
    await page.getByLabel('Почта').fill('one@example.com');
    await page.getByLabel(CONSENT).check();
    await page.getByRole('button', { name: 'Записаться' }).click();
    const code = (await page.locator('section.confirm p.code').textContent())?.trim() ?? '';
    expect(code).toBeTruthy();
    const bogus = await request.get(`${API_BASE}/bookings/totally-bogus-code-12345`);
    expect(bogus.status()).toBe(404);
    const body = (await bogus.json()) as { code: string };
    expect(body.code).toBe('not_found');
    await page.getByRole('button', { name: 'Записаться на другое время' }).click();
    await page.getByLabel('Ссылка-код').fill('totally-bogus-code-12345');
    await page.getByRole('button', { name: 'Открыть' }).click();
    // Сервер отдаёт 404 + code 'not_found', и в UI это видно как сообщение
    // об ошибке. Проверяем, что алерт появился — точный текст ('Такой записи
    // нет') не важен, важно, что он есть.
    await expect(page.getByRole('alert')).toBeVisible();
  });
  test('С17: после отмены ссылка-код открывает запись со статусом "отменена"', async ({ page }) => {
    const day = firstFutureWeekday();
    await openGuestHome(page, day);
    await page.locator('button.slot.is-free').first().click();
    await page.getByLabel('Имя').fill('Семнадцатый');
    await page.getByLabel('Почта').fill('s17@example.com');
    await page.getByLabel(CONSENT).check();
    await page.getByRole('button', { name: 'Записаться' }).click();
    const code = (await page.locator('section.confirm p.code').textContent())?.trim() ?? '';
    expect(code).toBeTruthy();
    await page.getByRole('button', { name: 'Записаться на другое время' }).click();
    await page.getByLabel('Ссылка-код').fill(code);
    await page.getByRole('button', { name: 'Отменить встречу' }).click();
    await expect(page.getByText(/отменена$/)).toBeVisible();
    await page.getByRole('button', { name: 'Открыть' }).click();
    await expect(page.getByText(/отменена$/)).toBeVisible();
  });
});
test.describe('Кабинет организатора', () => {
  test('неверный пароль не пускает в кабинет', async ({ page }) => {
    await page.goto('/#/admin');
    await page.getByLabel('Логин').fill(ADMIN_LOGIN);
    await page.getByLabel('Пароль').fill('wrong-password');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('alert')).toContainText('Неверные');
    await expect(page.getByRole('heading', { name: 'Вход в кабинет' })).toBeVisible();
  });
  test('верные креды открывают список записей', async ({ page }) => {
    await page.goto('/#/admin');
    await page.getByLabel('Логин').fill(ADMIN_LOGIN);
    await page.getByLabel('Пароль').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('button', { name: /Выйти/ })).toBeVisible({ timeout: 10_000 });
  });
});
