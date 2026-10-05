/**
 * База данных: подключение и схема.
 *
 * Схема применяется при каждом открытии (CREATE TABLE IF NOT EXISTS):
 * отдельных миграций на нулевой стадии нет, изменение схемы живёт здесь.
 * Форматы хранения (AGENTS, раздел 7):
 *   - моменты (start_utc, end_utc, created_at) — ISO-8601 в UTC, строкой;
 *   - окно часов приёма — строки ЧЧ:ММ:СС в поясе организатора;
 *   - дни недели — JSON-массив вида ["mon","tue"].
 * Объект Date применяется только в слотном движке.
 */

import Database from 'better-sqlite3';

export type Db = Database.Database;

/** Открывает базу и применяет схему. Значение ':memory:' даёт базу в памяти. */
export function openDatabase(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Гонка двух одновременных записей: вторая ждёт, а не падает с SQLITE_BUSY.
  db.pragma('busy_timeout = 5000');
  applySchema(db);
  return db;
}

function applySchema(db: Db): void {
  db.exec(`
    -- Кабинет один, организатор один: строка ровно одна (id = 1).
    -- Заполняется вместе с логикой входа, хэш пароля считает node:crypto.
    CREATE TABLE IF NOT EXISTS organizer (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      login TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );

    -- Тип встречи со своими часами приёма. Часы приёма задаются целиком:
    -- либо все пять колонок заполнены, либо все NULL — часов нет, слоты
    -- не строятся, гость видит пустую сетку (С10).
    CREATE TABLE IF NOT EXISTS meeting_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 1440),
      description TEXT NOT NULL DEFAULT '',
      days_of_week TEXT,
      window_start TEXT,
      window_end TEXT,
      step_minutes INTEGER,
      time_zone TEXT,
      CHECK (
        (days_of_week IS NULL AND window_start IS NULL AND window_end IS NULL
          AND step_minutes IS NULL AND time_zone IS NULL)
        OR
        (days_of_week IS NOT NULL AND window_start IS NOT NULL AND window_end IS NOT NULL
          AND step_minutes IS NOT NULL AND time_zone IS NOT NULL)
      ),
      -- Начало окна раньше его конца (С14), сравнение строк корректно
      -- для нулеполных ЧЧ:ММ:СС.
      CHECK (window_start IS NULL OR window_start < window_end),
      CHECK (step_minutes IS NULL OR step_minutes BETWEEN 1 AND 720)
    );

    -- Запись: одно пересекающееся по времени занятое пространство одного гостя.
    -- start_utc/end_utc — моменты UTC, time_zone — пояс организатора
    -- на момент записи, для показа рядом с поясом гостя (С5).
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_type_id INTEGER NOT NULL REFERENCES meeting_types(id),
      start_utc TEXT NOT NULL,
      end_utc TEXT NOT NULL,
      time_zone TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      guest_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
      access_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      CHECK (end_utc > start_utc)
    );

    -- Страховка инварианта «не двух гостей на одно время»: равные начала
    -- действующих записей невозможны даже при гонке (AGENTS, раздел 7).
    -- Неравные пересечения закрывает проверка «свободно» в той же
    -- транзакции, что и вставка (решение Q3 этапа сервера).
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_start
      ON bookings (start_utc) WHERE status = 'active';

    -- Второй рубеж против гонки: пересекающиеся действующие записи
    -- отвергаются самой базой. Первый рубеж это проверка «свободно»
    -- в транзакции; сюда доходит только то, что проверка пропустила.
    CREATE TRIGGER IF NOT EXISTS bookings_no_active_overlap
      BEFORE INSERT ON bookings
      WHEN NEW.status = 'active'
        AND EXISTS (
          SELECT 1 FROM bookings
          WHERE status = 'active'
            AND NEW.start_utc < end_utc
            AND start_utc < NEW.end_utc
        )
    BEGIN
      SELECT RAISE(ABORT, 'BOOKING_OVERLAP');
    END;

    -- Кабинет: сессии входа организатора (кука session, С6).
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS bookings_meeting_type
      ON bookings (meeting_type_id);
  `);
}
