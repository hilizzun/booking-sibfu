/**
 * Записи в кабинете: фильтр по статусу, таблица и отмена (С3, С8, С17).
 * Время показывается в поясе смотрящего, хранимое время не меняется (С5, С15).
 */

import { useCallback, useEffect, useState } from 'react';

import {
  adminCancelBooking,
  adminFetchBookings,
  ApiRequestError,
  type Booking,
  type BookingStatus,
} from '../api.js';

type Filter = 'all' | BookingStatus;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Действующие' },
  { value: 'cancelled', label: 'Отменённые' },
];

/** Момент UTC в показ пояса смотрящего: дата и время. */
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BookingsPanel() {
  const [filter, setFilter] = useState<Filter>('all');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = useCallback(
    async (current: Filter) => {
      try {
        const loaded = await adminFetchBookings(current === 'all' ? undefined : current);
        setBookings(loaded);
        setError(null);
      } catch (requestError) {
        if (requestError instanceof ApiRequestError) {
          setError(requestError.body.message);
        } else {
          setError('Список записей не загрузился');
        }
      }
    },
    [],
  );

  useEffect(() => {
    void reload(filter);
  }, [filter, reload]);

  async function cancel(booking: Booking): Promise<void> {
    setBusyId(booking.id);
    try {
      await adminCancelBooking(booking.id);
      await reload(filter);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError) {
        setError(requestError.body.message);
      } else {
        setError('Не получилось отменить, попробуйте ещё раз');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label="Записи">
      <div className="row between">
        <h2>Записи</h2>
        <div className="tabs" role="tablist" aria-label="Фильтр записей">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={filter === item.value}
              className={filter === item.value ? 'tab is-active' : 'tab'}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {bookings === null ? (
        <p className="muted">Загружаю записи…</p>
      ) : bookings.length === 0 ? (
        <p className="muted">Записей нет.</p>
      ) : (
        <table className="bookings">
          <thead>
            <tr>
              <th>Когда</th>
              <th>Тип встречи</th>
              <th>Гость</th>
              <th>Почта</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => {
              const isActive = booking.status === 'active';
              return (
                <tr key={booking.id} className={isActive ? 'is-active' : 'is-cancelled'}>
                  <td>{formatWhen(booking.start)}</td>
                  <td>{booking.meeting_type_name}</td>
                  <td>{booking.guest_name}</td>
                  <td>{booking.guest_email}</td>
                  <td>{isActive ? 'действует' : 'отменена'}</td>
                  <td>
                    {isActive && (
                      <button
                        type="button"
                        className="danger small"
                        disabled={busyId === booking.id}
                        onClick={() => void cancel(booking)}
                      >
                        {busyId === booking.id ? 'Отменяю…' : 'Отменить'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}