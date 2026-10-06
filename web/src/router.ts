/**
 * Минимальный хэш-роутер: без зависимостей, на hashchange.
 * Состояние это строка пути вроде "/admin/types".
 *
 * Глубокие ссылки (`#/admin/bookings`) работают без серверной перенастройки,
 * браузер сам раздаёт страницу при прямом заходе по хэшу.
 */

import { useEffect, useState } from 'react';

/** Путь без ведущего `#`. Корень представлен пустой строкой. */
export function currentHashPath(): string {
  const hash = window.location.hash;
  return hash.startsWith('#') ? hash.slice(1) : '';
}

/** Прыгает на путь. Пустая строка ведёт на корень. */
export function navigate(path: string): void {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

/**
 * Подписывается на изменения хэша и возвращает текущий путь.
 * В SSR или тестах без `window` возвращает начальную строку без подписки.
 */
export function useHashRoute(initial: string): string {
  const [path, setPath] = useState<string>(() => {
    const live = currentHashPath();
    return live.length === 0 ? initial : live;
  });

  useEffect(() => {
    function onChange(): void {
      const next = currentHashPath();
      setPath(next.length === 0 ? initial : next);
    }
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, [initial]);

  return path;
}