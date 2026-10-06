/**
 * Кабинет организатора: вход, навигация между разделами, выход (С6, С7, С8).
 *
 * Кука session httpOnly — её ставит и гасит сервер. Состояние «залогинен»
 * держим сами: при входе считаем, что сессия есть, при ошибке доступа —
 разлогиниваем (С17).
 */

import { useState } from 'react';

import { adminFetchMeetingTypes, adminLogout, ApiRequestError } from './api.js';
import { BookingsPanel } from './components/BookingsPanel.js';
import { LoginForm } from './components/LoginForm.js';
import { MeetingTypesPanel } from './components/MeetingTypesPanel.js';
import { navigate } from './router.js';

type AdminSection = 'types' | 'bookings';

interface AdminTabsProps {
  section: AdminSection;
  onSelect: (section: AdminSection) => void;
}

function AdminTabs({ section, onSelect }: AdminTabsProps) {
  return (
    <nav className="tabs primary" aria-label="Разделы кабинета">
      <button
        type="button"
        role="tab"
        aria-selected={section === 'types'}
        className={section === 'types' ? 'tab is-active' : 'tab'}
        onClick={() => onSelect('types')}
      >
        Типы встреч
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={section === 'bookings'}
        className={section === 'bookings' ? 'tab is-active' : 'tab'}
        onClick={() => onSelect('bookings')}
      >
        Записи
      </button>
    </nav>
  );
}

export function AdminApp() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [section, setSection] = useState<AdminSection>('types');
  const [error, setError] = useState<string | null>(null);

  async function handleLogout(): Promise<void> {
    try {
      await adminLogout();
    } catch {
      // Даже если сервер недоступен, сессия на клиенте уже не нужна.
    }
    setLoggedIn(false);
    navigate('/');
  }

  /**
   * При открытии кабинета сессия могла остаться от прошлого захода:
   * пробуем лёгкий запрос и при успехе пропускаем форму входа.
   */
  async function probe(): Promise<void> {
    try {
      await adminFetchMeetingTypes();
      setLoggedIn(true);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        setLoggedIn(false);
      } else {
        setError('Связь с сервером потеряна, попробуйте позже');
      }
    }
  }

  if (!loggedIn) {
    return (
      <main className="page">
        <h1>Кабинет организатора</h1>
        <p className="muted">Войдите, чтобы управлять встречами и типами приёма.</p>
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <LoginForm
          onLoggedIn={() => {
            setError(null);
            setLoggedIn(true);
          }}
        />
        <button
          type="button"
          className="ghost"
          onClick={() => void probe()}
        >
          Уже входили, проверить сессию
        </button>
        <p>
          <a href="#/">На главную</a>
        </p>
      </main>
    );
  }

  return (
    <main className="page admin">
      <div className="row between">
        <h1>Кабинет организатора</h1>
        <div className="row">
          <a className="ghost-link" href="#/">
            На главную
          </a>
          <button type="button" className="ghost" onClick={() => void handleLogout()}>
            Выйти
          </button>
        </div>
      </div>
      <AdminTabs section={section} onSelect={setSection} />
      {section === 'types' ? <MeetingTypesPanel /> : <BookingsPanel />}
    </main>
  );
}