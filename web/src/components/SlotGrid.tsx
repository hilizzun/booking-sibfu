/**
 * Сетка слотов выбранного дня. Время показывается в поясе смотрящего,
 * хранимое время при этом не меняется (С5, С15).
 * Занятые слоты видны, но недоступны. Прошедшие слоты закрыты для записи.
 */

import type { Slot } from '../api.js';

interface SlotGridProps {
  slots: Slot[];
  selectedStart: string | null;
  onSelect: (slot: Slot) => void;
}

/** Момент UTC в показ пояса смотрящего: часы и минуты. */
export function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Слот закрыт для записи, если его старт уже наступил. */
export function isSlotPast(slot: Slot, now: number): boolean {
  return new Date(slot.start).getTime() <= now;
}

export function SlotGrid({ slots, selectedStart, onSelect }: SlotGridProps) {
  const now = Date.now();
  if (slots.length === 0) {
    return <p className="muted">На этот день слотов нет.</p>;
  }
  return (
    <div className="slots">
      {slots.map((slot) => {
        const past = isSlotPast(slot, now);
        const disabled = !slot.is_free || past;
        const selected = slot.start === selectedStart;
        const title = past
          ? 'Время уже прошло'
          : slot.is_free
            ? `Занять ${formatSlotTime(slot.start)}`
            : 'Слот занят';
        return (
          <button
            key={slot.start}
            type="button"
            disabled={disabled}
            title={title}
            aria-pressed={selected}
            className={
              selected ? 'slot is-selected' : disabled ? 'slot is-busy' : 'slot is-free'
            }
            onClick={() => onSelect(slot)}
          >
            {formatSlotTime(slot.start)}
          </button>
        );
      })}
    </div>
  );
}
