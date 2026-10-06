# Сервис бронирования тайм-слотов

Сервис самостоятельной записи на созвоны и встречи. Организатор заводит
типы встреч и часы приёма, гость открывает страницу, выбирает свободный
слот в своём часовом поясе и оставляет запись.

Проект собран методом Design First: сначала продуктовое решение, потом
контракт API на TypeSpec, потом код, который этому контракту соответствует,
потом тесты.

## Стек

| Слой | Технология |
|---|---|
| Язык | TypeScript в строгом режиме, Node.js 22 LTS |
| Сервис | Fastify 5, проверка данных на Zod 4 |
| Хранение | SQLite через better-sqlite3 |
| Контракт | TypeSpec в `contract/main.tsp`, OpenAPI 3.1 в `contract/openapi.yaml` |
| Интерфейс | Vite, React 19, собственный CSS без библиотек компонентов |
| Тесты | Vitest для модульных и интеграционных, Playwright для сквозных |
| Запуск | Docker и docker compose |
| Непрерывная интеграция | GitHub Actions |

## Что нужно поставить заранее

Только Node.js версии 22. Проверить:

```powershell
node --version
```

`better-sqlite3` поставляется с готовыми сборками для Windows, macOS и Linux,
ничего компилировать вручную не придётся.

## Запуск на Windows (PowerShell)

Из папки с проектом, по одной команде.

```powershell
npm install
```

```powershell
npm run seed
```

Дальше нужны два окна PowerShell. В первом запускается сервис:

```powershell
npm run dev:server
```

Во втором окне, из той же папки, запускается интерфейс:

```powershell
npm run dev:web
```

Откройте http://localhost:5173.

Остановить любую из команд: сочетание Ctrl+C в её окне.

Если PowerShell отказывается выполнять `npm.ps1`, разрешите это для текущего
окна и повторите команду:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Запуск на macOS

Из папки с проектом, по одной команде.

```bash
npm install
```

```bash
npm run seed
```

Первое окно терминала:

```bash
npm run dev:server
```

Второе окно терминала:

```bash
npm run dev:web
```

Откройте http://localhost:5173.

Остановить: сочетание Control+C в соответствующем окне.

## Запуск в собранном виде, один порт

Команды одинаковы на Windows и на macOS. Так сервис работает в контейнере:
интерфейс собирается заранее и отдаётся тем же сервером, что и API.

```bash
npm run build
```

```bash
npm run start
```

Откройте http://localhost:8000.

## Запуск в Docker

Нужен установленный Docker Desktop. Команды одинаковы на обеих системах.

```bash
docker compose up -d --build
```

Сервис поднимется на http://localhost:8000, база наполнится демонстрационными
данными автоматически. Флаг `-d` уводит контейнер в фон, терминал остаётся
свободным. Посмотреть журнал: `docker compose logs -f`, выход Ctrl+C.
Остановить:

```bash
docker compose down
```

Удалить вместе с сохранёнными бронями:

```bash
docker compose down -v
```

Перед запуском можно переопределить учётную запись организатора и пароль:

```powershell
$env:ORGANIZER_LOGIN='organizer'; $env:ORGANIZER_PASSWORD='organizer'; docker compose up -d --build
```

```bash
ORGANIZER_LOGIN=organizer ORGANIZER_PASSWORD=organizer docker compose up -d --build
```

## Тесты

```bash
npm test
```

Сквозные тесты Playwright (запускаются после сборки):

```bash
npm run build
npm run test:e2e
```

При первом запуске нужно скачать браузер:

```bash
npm run test:e2e:install
```

## Переменные окружения

| Переменная | По умолчанию | Смысл |
|---|---|---|
| `PORT` | `8000` | порт сервиса |
| `HOST` | `0.0.0.0` | адрес, который слушает сервис |
| `DB_FILE` | `booking.db` | файл базы данных |
| `WEB_DIR` | пусто | папка со собранным интерфейсом; в Docker это `web/dist` |
| `ORGANIZER_LOGIN` | `organizer` | логин кабинета |
| `ORGANIZER_PASSWORD` | `organizer` | пароль кабинета |

## Если что-то не завелось

| Признак | Что делать |
|---|---|
| `npm` не найден | поставьте Node.js 22 с nodejs.org и откройте новое окно терминала |
| PowerShell не даёт запустить `npm` | выполните `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` |
| Порт 8000 занят | запустите с другим портом: `npm start` после `$env:PORT=8001` в PowerShell или `PORT=8001 npm start` на macOS |
| Порт 5173 занят | Vite сам предложит следующий свободный порт |
| В интерфейсе «Типов встреч пока нет» | выполните `npm run seed` и обновите страницу |
| Слотов нет ни в один день | у типа встречи нет часов приёма; добавьте их в кабинете |
| `npm run test:e2e` жалуется, что не найден `server/dist` | сначала выполните `npm run build` |
| `docker compose` не находит `Dockerfile` | команда выполняется из папки проекта |
| Контейнер стартует, но страница пуста | проверьте, что в `docker-compose.yml` указан том `booking-data` и папка `/data` существует в образе |
