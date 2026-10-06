/**
 * Выбор типа встречи. Пустой список это не ошибка, а тип без часов (С10):
 * гость видит пояснение, а не пустой экран.
 */

import type { MeetingType } from '../api.js';

interface ActivityPickerProps {
  types: MeetingType[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function ActivityPicker({ types, selectedId, onSelect }: ActivityPickerProps) {
  if (types.length === 0) {
    return <p className="muted">Пока нет типов встреч, загляните позже.</p>;
  }
  return (
    <div className="picker" role="listbox" aria-label="Тип встречи">
      {types.map((type) => (
        <button
          key={type.id}
          type="button"
          role="option"
          aria-selected={type.id === selectedId}
          className={type.id === selectedId ? 'picker-item is-selected' : 'picker-item'}
          onClick={() => onSelect(type.id)}
        >
          <span className="picker-name">{type.name}</span>
          <span className="muted">
            {type.duration_minutes} мин
            {type.schedule === undefined ? ', время уточняйте' : `, ${type.schedule.time_zone}`}
          </span>
        </button>
      ))}
    </div>
  );
}
