/**
 * Гостевой экран: активность, неделя, выбранный слот, своя встреча по коду.
 *
 * Живёт на корне (`/` или `#/`). Кабинет организатора — отдельная страница
 * (`#/admin`), здесь на него есть только ссылка в шапке.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ApiRequestError,
  cancelBooking,
  fetchBooking,
  fetchMeetingTypes,
  fetchSlots,
  type MeetingType,
  type Slot,
} from './api.js';
import { ActivityPicker } from './components/ActivityPicker.js';
import { BookingPanel } from './components/BookingPanel.js';
import { SlotGrid } from './components/SlotGrid.js';
import { addDaysValue, toDateValue, WeekBar, type DayItem } from './components/WeekBar.js';

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function weekDays(weekStart: string, selected: string): DayItem[] {
  const today = toDateValue(new Date());
  return Array.from({ length: 7 }, (_, index) => {
    const value = addDaysValue(weekStart, index);
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return {
      value,
      label: `${day}.${String(month).padStart(2, '0')}`,
      weekday: WEEKDAYS[date.getDay()],
      isPast: value < today,
      isSelected: value === selected,
    };
  });
}

function mondayOf(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const shift = (date.getDay() + 6) % 7;
  return addDaysValue(value, -shift);
}

export function GuestApp() {
  const [types, setTypes] = useState<MeetingType[]>([]);
  const [meetingTypeId, setMeetingTypeId] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState(() => mondayOf(toDateValue(new Date())));
  const [day, setDay] = useState(() => toDateValue(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [own, setOwn] = useState<string | null>(null);

  const selectedType = types.find((type) => type.id === meetingTypeId) ?? null;
  const days = useMemo(() => weekDays(weekStart, day), [weekStart, day]);

  useEffect(() => {
    fetchMeetingTypes()
      .then((loaded) => {
        setTypes(loaded);
        if (loaded.length > 0) {
          setMeetingTypeId((current) => current ?? loaded[0].id);
        }
      })
      .catch(() => setNotice('Не получилось загрузить типы встреч'));
  }, []);

  const loadSlots = useCallback(async () => {
    if (meetingTypeId === null) {
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const grid = await fetchSlots(meetingTypeId, day, day);
      setSlots(grid);
      setSelectedSlot((current) =>
        current === null ? null : (grid.find((slot) => slot.start === current.start) ?? null),
      );
    } catch (error) {
      setNotice(error instanceof ApiRequestError ? error.body.message : 'Слоты не загрузились');
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [meetingTypeId, day]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  function shiftWeek(delta: number): void {
    setWeekStart((current) => addDaysValue(current, delta));
  }

  async function openOwn(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setNotice(null);
    setOwn(null);
    const trimmed = code.trim();
    if (trimmed.length === 0) {
      setNotice('Введите ссылку-код с подтверждения');
      return;
    }
    try {
      const booking = await fetchBooking(trimmed);
      const when = new Date(booking.start).toLocaleString('ru-RU');
      const state = booking.status === 'active' ? 'действует' : 'отменена';
      setOwn(`${booking.meeting_type_name}, ${when}, ${state}`);
    } catch (error) {
      setNotice(error instanceof ApiRequestError ? error.body.message : 'Встреча не открылась');
    }
  }

  async function cancelOwn(): Promise<void> {
    const trimmed = code.trim();
    if (trimmed.length === 0) {
      return;
    }
    try {
      const booking = await cancelBooking(trimmed);
      const when = new Date(booking.start).toLocaleString('ru-RU');
      setOwn(`${booking.meeting_type_name}, ${when}, отменена`);
      void loadSlots();
    } catch (error) {
      setNotice(error instanceof ApiRequestError ? error.body.message : 'Не получилось отменить');
    }
  }

  return (
    <main className="page">
      <div className="row between">
        <h1>Запись на встречу</h1>
        <a className="ghost-link" href="#/admin">
          Кабинет организатора
        </a>
      </div>
      <p className="muted">Время показано в вашем часовом поясе.</p>

      <section aria-label="Тип встречи">
        <h2>Встреча</h2>
        <ActivityPicker
          types={types}
          selectedId={meetingTypeId}
          onSelect={(id) => {
            setMeetingTypeId(id);
            setSelectedSlot(null);
          }}
        />
      </section>

      <section aria-label="День">
        <h2>День</h2>
        <WeekBar days={days} onSelect={setDay} onShift={shiftWeek} />
      </section>

      <section aria-label="Время">
        <h2>Время</h2>
        {loading ? (
          <p className="muted">Загружаю слоты…</p>
        ) : (
          <SlotGrid
            slots={slots}
            selectedStart={selectedSlot?.start ?? null}
            onSelect={setSelectedSlot}
          />
        )}
        {selectedType?.schedule === undefined && (
          <p className="muted">У этого типа встречи пока нет часов приёма.</p>
        )}
      </section>

      {meetingTypeId !== null && (
        <section aria-label="Запись">
          <BookingPanel
            meetingTypeId={meetingTypeId}
            slot={selectedSlot}
            onBooked={() => void loadSlots()}
          />
        </section>
      )}

      <section aria-label="Моя встреча">
        <h2>Моя встреча</h2>
        <form className="lookup" onSubmit={openOwn}>
          <label>
            Ссылка-код
            <input value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <div className="row">
            <button type="submit">Открыть</button>
            <button type="button" className="ghost" onClick={() => void cancelOwn()}>
              Отменить встречу
            </button>
          </div>
        </form>
        {own !== null && <p aria-live="polite">{own}</p>}
      </section>

      {notice !== null && (
        <p className="error" role="alert">
          {notice}
        </p>
      )}
    </main>
  );
}