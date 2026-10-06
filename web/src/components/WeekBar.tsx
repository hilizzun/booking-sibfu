/**
 * Полоса недели: семь календарных дней в поясе смотрящего.
 * Прошедшие дни приглушены, но доступны для просмотра.
 * Даты диапазона для сервера это дни в поясе организатора.
 */

export interface DayItem {
  value: string;
  label: string;
  weekday: string;
  isPast: boolean;
  isSelected: boolean;
}

interface WeekBarProps {
  days: DayItem[];
  onSelect: (value: string) => void;
  onShift: (delta: number) => void;
}

export function WeekBar({ days, onSelect, onShift }: WeekBarProps) {
  return (
    <div className="weekbar">
      <button type="button" className="ghost" onClick={() => onShift(-7)} aria-label="Неделя назад">
        Назад
      </button>
      <div className="weekdays" role="tablist" aria-label="Дни недели">
        {days.map((day) => (
          <button
            key={day.value}
            type="button"
            role="tab"
            aria-selected={day.isSelected}
            className={
              day.isSelected ? 'day is-selected' : day.isPast ? 'day is-past' : 'day'
            }
            onClick={() => onSelect(day.value)}
          >
            <span className="day-weekday">{day.weekday}</span>
            <span className="day-label">{day.label}</span>
          </button>
        ))}
      </div>
      <button type="button" className="ghost" onClick={() => onShift(7)} aria-label="Неделя вперёд">
        Вперёд
      </button>
    </div>
  );
}

/** Строка ГГГГ-ММ-ДД из даты без сдвига пояса. */
export function toDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Добавляет дни к строке даты в местном поясе смотрящего. */
export function addDaysValue(value: string, delta: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const shifted = new Date(year, month - 1, day + delta);
  return toDateValue(shifted);
}
