/**
 * Вход в кабинет: сессии на случайных токенах (С6).
 * Кука session это opaque-токен, в базе хранится только он сам,
 * пароль организатора хранится хэшем sha256 с солью из логина.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { Db } from './db.js';
import { unauthorized } from './errors.js';

export const SESSION_COOKIE = 'session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export function hashPassword(login: string, password: string): string {
  return createHash('sha256').update(`${login}:${password}`).digest('hex');
}

/** Учётная запись организатора заводится из окружения при старте (PDR С6). */
export function ensureOrganizer(db: Db): void {
  const login = process.env.ORGANIZER_LOGIN ?? 'organizer';
  const password = process.env.ORGANIZER_PASSWORD ?? 'organizer';
  const existing = db.prepare('SELECT id FROM organizer WHERE id = 1').get();
  if (existing === undefined) {
    db.prepare('INSERT INTO organizer (id, login, password_hash) VALUES (1, ?, ?)').run(
      login,
      hashPassword(login, password),
    );
    return;
  }
  db.prepare('UPDATE organizer SET login = ?, password_hash = ? WHERE id = 1').run(
    login,
    hashPassword(login, password),
  );
}

/** Открывает сессию и возвращает токен для куки. */
export function openSession(db: Db): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token, created_at) VALUES (?, ?)').run(
    token,
    new Date().toISOString(),
  );
  return token;
}

/** Закрывает сессию: повторный выход с тем же токеном тоже успешен. */
export function closeSession(db: Db, token: string | undefined): void {
  if (token === undefined || token.length === 0) {
    return;
  }
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** Проверяет куку session, без неё вход запрещён. */
export function requireSession(db: Db, cookieHeader: string | undefined): void {
  const token = readSessionToken(cookieHeader);
  if (token === undefined) {
    throw unauthorized('unauthorized', 'Войдите в кабинет, чтобы продолжить');
  }
  const found = db.prepare('SELECT token FROM sessions WHERE token = ?').get(token);
  if (found === undefined) {
    throw unauthorized('unauthorized', 'Войдите в кабинет, чтобы продолжить');
  }
}

function readSessionToken(cookieHeader: string | undefined): string | undefined {
  if (cookieHeader === undefined) {
    return undefined;
  }
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE && rest.length > 0) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return undefined;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Проверяет логин и пароль, при успехе открывает сессию. */
export function login(db: Db, loginName: string, password: string): string {
  const row = db
    .prepare('SELECT login, password_hash AS hash FROM organizer WHERE id = 1')
    .get() as { login: string; hash: string } | undefined;
  if (row === undefined || row.login !== loginName) {
    throw unauthorized('unauthorized', 'Неверные логин или пароль');
  }
  const digest = hashPassword(row.login, password);
  if (digest.length !== row.hash.length || digest !== row.hash) {
    throw unauthorized('unauthorized', 'Неверные логин или пароль');
  }
  return openSession(db);
}
