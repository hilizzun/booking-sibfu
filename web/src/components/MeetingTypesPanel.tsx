/**
 * Управление типами встреч: список с краткой сводкой, кнопка создания,
 * правка и удаление выбранного типа через MeetingTypeEditor.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  adminDeleteMeetingType,
  adminFetchMeetingTypes,
  ApiRequestError,
  type MeetingType,
} from '../api.js';
import { MeetingTypeEditor } from './MeetingTypeEditor.js';

/** Дни недели в показе в поясе организатора (С14). */
function scheduleSummary(type: MeetingType): string {
  const schedule = type.schedule;
  if (schedule === undefined) {
    return 'часы приёма не заданы';
  }
  const days = schedule.days_of_week.length;
  return `${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}, ${schedule.start}–${schedule.end}, шаг ${schedule.step_minutes} мин, ${schedule.time_zone}`;
}

export function MeetingTypesPanel() {
  const [types, setTypes] = useState<MeetingType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: 'create' } | { kind: 'edit'; type: MeetingType } | null>(
    null,
  );

  const reload = useCallback(async () => {
    try {
      const loaded = await adminFetchMeetingTypes();
      setTypes(loaded);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError) {
        setError(requestError.body.message);
      } else {
        setError('Список типов встреч не загрузился');
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleDelete(type: MeetingType): Promise<void> {
    try {
      await adminDeleteMeetingType(type.id);
      setEditing(null);
      await reload();
    } catch (requestError) {
      if (requestError instanceof ApiRequestError) {
        setError(requestError.body.message);
      } else {
        setError('Не получилось удалить, попробуйте ещё раз');
      }
    }
  }

  if (editing !== null) {
    if (editing.kind === 'create') {
      return (
        <MeetingTypeEditor
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      );
    }
    return (
      <MeetingTypeEditor
        type={editing.type}
        onCancel={() => setEditing(null)}
        onDelete={handleDelete}
        onSaved={() => {
          setEditing(null);
          void reload();
        }}
      />
    );
  }

  if (types === null) {
    return <p className="muted">Загружаю типы встреч…</p>;
  }

  return (
    <section aria-label="Типы встреч">
      <div className="row between">
        <h2>Типы встреч</h2>
        <button type="button" onClick={() => setEditing({ kind: 'create' })}>
          Новый тип
        </button>
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {types.length === 0 ? (
        <p className="muted">Типов встреч пока нет. Создайте первый.</p>
      ) : (
        <ul className="list">
          {types.map((type) => (
            <li key={type.id} className="list-item">
              <div>
                <strong>{type.name}</strong>
                <span className="muted">
                  {' '}
                  · {type.duration_minutes} мин · {scheduleSummary(type)}
                </span>
                {type.description.length > 0 && (
                  <p className="muted small">{type.description}</p>
                )}
              </div>
              <button type="button" className="ghost" onClick={() => setEditing({ kind: 'edit', type })}>
                Править
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}