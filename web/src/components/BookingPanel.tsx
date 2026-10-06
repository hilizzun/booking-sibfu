/**
 * Запись на выбранный слот и подтверждение.
 *
 * Состояния экрана:
 *   1. слот не выбран (или выбран занятый/прошедший) — подсказка;
 *   2. слот свободный и форма не отправлялась — форма с именем и почтой;
 *   3. только что записались — карточка подтверждения с кодом и файлом календаря.
 *
 * Подтверждение привязано к моменту записи, а не к выбранному слоту:
 * если пользователь после брони тыкает в другой слот, подтверждение
 * уходит, и открывается форма для нового слота (С1, С4).
 *
 * Перед отправкой требуется согласие на обработку имени и почты (152-ФЗ).
 * Согласие запоминается в localStorage, повторно не спрашиваем.
 */

import { useEffect, useState } from 'react';

import {
  ApiRequestError,
  calendarUrl,
  createBooking,
  type Slot,
} from '../api.js';
import { formatSlotTime, isSlotPast } from './SlotGrid.js';

interface BookingPanelProps {
  meetingTypeId: number;
  slot: Slot | null;
  /** Сообщить о удаче, чтобы родитель перезагрузил слоты. */
  onBooked: (accessCode: string) => void;
}

interface Confirmation {
  accessCode: string;
  calendar: string;
  /** Начало слота, на который реально записались. */
  bookedAt: string;
}

/** Ключ согласия на обработку персональных данных. Версия нужна на случай смены текста. */
const CONSENT_KEY = 'booking.consent.v1';

/** Читает сохранённое согласие. localStorage может быть недоступен — считаем, что нет. */
function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'yes';
  } catch {
    return false;
  }
}

/** Сохраняет или сбрасывает согласие. */
function writeConsent(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(CONSENT_KEY, 'yes');
    } else {
      localStorage.removeItem(CONSENT_KEY);
    }
  } catch {
    // Без localStorage живём как есть: в текущей сессии галка не сохранится.
  }
}

export function BookingPanel({ meetingTypeId, slot, onBooked }: BookingPanelProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [consent, setConsent] = useState<boolean>(readConsent);

  // Смена старта слота — это явное намерение «работаю с другим временем»:
  // прошлое подтверждение перестаёт быть актуальным, форма откроется заново.
  // Ключом служит именно start: после брони родитель перезагружает слоты и
  // подменяет объект слота, но start остаётся прежним — карточку не трогаем.
  useEffect(() => {
    setConfirmation(null);
    setError(null);
  }, [slot?.start]);

  function toggleConsent(next: boolean): void {
    setConsent(next);
    writeConsent(next);
  }

  async function submit(event: React.FormEvent, current: Slot): Promise<void> {
    event.preventDefault();
    if (!consent) {
      setError('Поставьте согласие на обработку данных, чтобы записаться');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const created = await createBooking({
        meeting_type_id: meetingTypeId,
        start: current.start,
        guest_name: name.trim(),
        guest_email: email.trim(),
      });
      setConfirmation({
        accessCode: created.access_code,
        calendar: calendarUrl(created.access_code),
        bookedAt: created.booking.start,
      });
      onBooked(created.access_code);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError) {
        setError(requestError.body.message);
      } else {
        setError('Не получилось записаться, попробуйте ещё раз');
      }
    } finally {
      setPending(false);
    }
  }

  // Подтверждение показывается всегда, пока пользователь сам его не сбросил
  // или не выбрал другой слот. Это не зависит от текущего состояния slot:
  // даже если только что занятый слот стал «не нашим» (status перезагрузили),
  // подтверждение остаётся — пользователь только что заплатил за время.
  if (confirmation !== null) {
    return (
      <section className="confirm" aria-live="polite">
        <h2>Вы записаны на {formatSlotTime(confirmation.bookedAt)}</h2>
        <p>
          Сохраните ссылку-код: по ней открывается встреча и отмена. По почте восстановить
          доступ нельзя.
        </p>
        <p className="code">{confirmation.accessCode}</p>
        <p>
          <a href={confirmation.calendar}>Добавить в календарь (.ics)</a>
        </p>
        <div className="row">
          <button type="button" onClick={() => setConfirmation(null)}>
            Записаться на другое время
          </button>
        </div>
      </section>
    );
  }

  // Слот не выбран, занят или в прошлом — записываться нельзя.
  if (slot === null || !slot.is_free || isSlotPast(slot, Date.now())) {
    return <p className="muted">Выберите свободный слот, чтобы записаться.</p>;
  }

  return (
    <form className="booking" onSubmit={(event) => void submit(event, slot)}>
      <h2>Запись на {formatSlotTime(slot.start)}</h2>
      <label>
        Имя
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
      </label>
      <label>
        Почта
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => toggleConsent(event.target.checked)}
        />
        <span>
          Соглашаюсь на обработку имени и почты для записи на встречу. Данные нужны
          организатору как контакт и не передаются третьим лицам.
        </span>
      </label>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending || !consent}>
        {pending ? 'Записываю…' : 'Записаться'}
      </button>
    </form>
  );
}