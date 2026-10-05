/**
 * Посев данных: без него гость видит пустую страницу (AGENTS, раздел 4).
 *
 * Кладёт демонстрационный тип встречи с часами приёма. Повторный запуск
 * ничего не дублирует. Учётная запись организатора появится вместе
 * с логикой входа на шаге 4 Design First.
 */

import { openDatabase } from './db.js';

const db = openDatabase(process.env.DB_FILE ?? 'booking.db');

const existing = db.prepare('SELECT COUNT(*) AS n FROM meeting_types').get() as { n: number };

if (existing.n === 0) {
  db.prepare(
    `INSERT INTO meeting_types
       (name, duration_minutes, description, days_of_week, window_start, window_end, step_minutes, time_zone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'Консультация',
    30,
    'Разбор вопросов по проекту',
    JSON.stringify(['mon', 'tue', 'wed', 'thu', 'fri']),
    '10:00:00',
    '17:00:00',
    30,
    process.env.ORGANIZER_TIME_ZONE ?? 'Europe/Moscow',
  );
  console.log('seed: демонстрационный тип встречи «Консультация» создан');
} else {
  console.log('seed: типы встреч уже есть, ничего не менялось');
}

db.close();
