/**
 * Корень страницы: гость или кабинет, по хэшу.
 *
 * `#/admin` отдаёт кабинет организатора. Любой другой путь — гость.
 * Никакой библиотеки роутинга, всё держится на `useHashRoute`.
 */

import { AdminApp } from './AdminApp.js';
import { GuestApp } from './GuestApp.js';
import { useHashRoute } from './router.js';

export function App() {
  const path = useHashRoute('/');
  if (path === '/admin' || path.startsWith('/admin/')) {
    return <AdminApp />;
  }
  return <GuestApp />;
}