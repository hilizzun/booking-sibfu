/**
 * Экран входа в кабинет. Сессионная кука ставится сервером и невидима из JS:
 * достаточно один раз получить 200, дальше она ходит сама (С6).
 */

import { useState } from 'react';

import { adminLogin, ApiRequestError } from '../api.js';

interface LoginFormProps {
  onLoggedIn: () => void;
}

export function LoginForm({ onLoggedIn }: LoginFormProps) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await adminLogin({ login: login.trim(), password });
      onLoggedIn();
    } catch (requestError) {
      if (requestError instanceof ApiRequestError) {
        setError(requestError.body.message);
      } else {
        setError('Не получилось войти, попробуйте ещё раз');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="Вход в кабинет">
      <h2>Вход в кабинет</h2>
      <form className="login" onSubmit={(event) => void submit(event)}>
        <label>
          Логин
          <input
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? 'Вхожу…' : 'Войти'}
        </button>
      </form>
    </section>
  );
}