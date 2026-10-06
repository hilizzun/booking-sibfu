/**
 * Форма правки типа встречи. Содержит название, длительность, описание и
 * часы приёма. Часы опциональны: пустая сетка это не ошибка (С10).
 *
 * Пустые дни не делают сетку: 0..7. Окно проверяется на стороне сервера (С14),
 * здесь собираем только то, что отдаст Zod.
 *
 * В режиме правки можно заменить расписание, но нельзя его «снять» через PATCH:
 * если у типа уже есть часы, чекбокс принудительно включён и только меняет их.
 */

import { useState } from 'react';

import {
  adminCreateMeetingType,
  adminUpdateMeetingType,
  ApiRequestError,
  type DayOfWeek,
  type MeetingType,
  type MeetingTypeCreate,
  type MeetingTypeUpdate,
  type Schedule,
} from '../api.js';

const WEEKDAYS: Array<{ value: DayOfWeek; label: string }> = [
  { value: 'mon', label: 'Пн' },
  { value: 'tue', label: 'Вт' },
  { value: 'wed', label: 'Ср' },
  { value: 'thu', label: 'Чт' },
  { value: 'fri', label: 'Пт' },
  { value: 'sat', label: 'Сб' },
  { value: 'sun', label: 'Вс' },
];

interface MeetingTypeEditorProps {
  /** Если задан, форма правит существующий тип; иначе создаёт новый. */
  type?: MeetingType;
  /** Сохранить и сообщить родителю о результате. */
  onSaved: (type: MeetingType) => void;
  /** Закрыть форму без сохранения. */
  onCancel: () => void;
  /** Удалить тип (только в режиме правки). */
  onDelete?: (type: MeetingType) => Promise<void> | void;
}

/** Заготовка часов приёма для нового типа. */
const EMPTY_SCHEDULE: Schedule = {
  days_of_week: [],
  start: '10:00:00',
  end: '18:00:00',
  step_minutes: 30,
  time_zone: 'Europe/Moscow',
};

function fromType(type: MeetingType) {
  return {
    name: type.name,
    duration_minutes: type.duration_minutes,
    description: type.description,
    schedule: type.schedule === undefined ? { ...EMPTY_SCHEDULE } : { ...type.schedule },
  };
}

export function MeetingTypeEditor({ type, onSaved, onCancel, onDelete }: MeetingTypeEditorProps) {
  const isEdit = type !== undefined;
  const initial = isEdit ? fromType(type) : {
    name: '',
    duration_minutes: 30,
    description: '',
    schedule: { ...EMPTY_SCHEDULE },
  };
  const [name, setName] = useState(initial.name);
  const [duration, setDuration] = useState(initial.duration_minutes);
  const [description, setDescription] = useState(initial.description);
  const scheduleWasSet = isEdit && type.schedule !== undefined;
  const [scheduleEnabled, setScheduleEnabled] = useState(scheduleWasSet);
  const [schedule, setSchedule] = useState<Schedule>(initial.schedule);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deletingNow, setDeletingNow] = useState(false);

  function toggleDay(value: DayOfWeek): void {
    setSchedule((current) => {
      const has = current.days_of_week.includes(value);
      const days = has
        ? current.days_of_week.filter((day) => day !== value)
        : [...current.days_of_week, value];
      return { ...current, days_of_week: days };
    });
  }

  /**
   * Локальная проверка перед запросом: пустое имя, неверное окно.
   * Сервер всё равно перепроверит (С14), но отвечать на понятные ошибки
   * сразу — быстрее для пользователя.
   */
  function validateClient(): string | null {
    if (name.trim().length === 0) {
      return 'Название не может быть пустым';
    }
    if (scheduleEnabled && !(schedule.start < schedule.end)) {
      return 'Начало рабочего окна должно быть раньше его конца';
    }
    return null;
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const localError = validateClient();
    if (localError !== null) {
      setError(localError);
      return;
    }
    setError(null);
    setPending(true);
    try {
      if (isEdit) {
        const patch: MeetingTypeUpdate = {
          name: name.trim(),
          duration_minutes: duration,
          description,
        };
        if (scheduleEnabled) {
          patch.schedule = schedule;
        }
        const saved = await adminUpdateMeetingType(type.id, patch);
        onSaved(saved);
      } else {
        const createPayload: MeetingTypeCreate = {
          name: name.trim(),
          duration_minutes: duration,
          description,
          schedule: scheduleEnabled ? schedule : undefined,
        };
        const saved = await adminCreateMeetingType(createPayload);
        onSaved(saved);
      }
    } catch (requestError) {
      if (requestError instanceof ApiRequestError) {
        setError(requestError.body.message);
      } else {
        setError('Не получилось сохранить, попробуйте ещё раз');
      }
    } finally {
      setPending(false);
    }
  }

  async function remove(): Promise<void> {
    if (type === undefined || onDelete === undefined) {
      return;
    }
    if (!window.confirm(`Удалить тип «${type.name}»? Действие необратимо.`)) {
      return;
    }
    setDeletingNow(true);
    try {
      await onDelete(type);
    } finally {
      setDeletingNow(false);
    }
  }

  // В правке с уже заданными часами чекбокс заблокирован: нельзя «снять»
  // расписание через PATCH, только заменить на новое.
  const scheduleLocked = scheduleWasSet;

  return (
    <section aria-label={isEdit ? 'Правка типа встречи' : 'Новый тип встречи'}>
      <h2>{isEdit ? `Тип встречи: ${type.name}` : 'Новый тип встречи'}</h2>
      <form className="editor" onSubmit={(event) => void submit(event)}>
        <label>
          Название
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label>
          Длительность, минут
          <input
            type="number"
            min={5}
            max={1440}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            required
          />
        </label>
        <label>
          Описание
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            rows={3}
          />
        </label>

        <fieldset className="schedule">
          <legend>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                disabled={scheduleLocked}
                onChange={(event) => setScheduleEnabled(event.target.checked)}
              />
              Часы приёма{scheduleLocked ? ' (уже заданы, можно только заменить)' : ''}
            </label>
          </legend>
          {scheduleEnabled && (
            <div className="schedule-body">
              <div className="weekday-row" role="group" aria-label="Дни недели">
                {WEEKDAYS.map((day) => {
                  const active = schedule.days_of_week.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      className={active ? 'day-toggle is-on' : 'day-toggle'}
                      aria-pressed={active}
                      onClick={() => toggleDay(day.value)}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
              <div className="time-row">
                <label>
                  Начало
                  <input
                    type="time"
                    step={1}
                    value={schedule.start}
                    onChange={(event) =>
                      setSchedule((current) => ({ ...current, start: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Конец
                  <input
                    type="time"
                    step={1}
                    value={schedule.end}
                    onChange={(event) =>
                      setSchedule((current) => ({ ...current, end: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Шаг, минут
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={schedule.step_minutes}
                    onChange={(event) =>
                      setSchedule((current) => ({
                        ...current,
                        step_minutes: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Часовой пояс (IANA)
                  <input
                    value={schedule.time_zone}
                    onChange={(event) =>
                      setSchedule((current) => ({ ...current, time_zone: event.target.value }))
                    }
                  />
                </label>
              </div>
            </div>
          )}
        </fieldset>

        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="row">
          <button type="submit" disabled={pending || deletingNow}>
            {pending ? 'Сохраняю…' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
          <button type="button" className="ghost" onClick={onCancel} disabled={pending || deletingNow}>
            Отмена
          </button>
          {isEdit && onDelete !== undefined && (
            <button
              type="button"
              className="danger"
              onClick={() => void remove()}
              disabled={pending || deletingNow}
            >
              {deletingNow ? 'Удаляю…' : 'Удалить'}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}