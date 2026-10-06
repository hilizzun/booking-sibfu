# Образ сервиса: собранный интерфейс и API в одном контейнере.
#
# Сборка идёт в два этапа. На первом ставятся все зависимости, собираются
# server и web, а потом из дерева зависимостей убирается всё, что нужно было
# только для сборки и тестов. На втором этапе остаётся готовый код и рабочие
# зависимости. Компилятор TypeScript, Vite и Playwright в готовый образ
# не попадают.

# ---------------------------------------------------------------------------
# Этап 1: сборка
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

# Браузеры Playwright в образе не нужны, скачивать их не надо.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# better-sqlite3 это модуль на C++. Обычно он ставит готовую сборку под нужную
# систему, и компилятор не требуется. Инструменты сборки стоят здесь на случай,
# если готовой сборки не нашлось: на размер итогового образа они не влияют,
# потому что остаются на первом этапе.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Сначала копируем только описания пакетов. Пока они не менялись, Docker берёт
# слой с установленными зависимостями из кеша и не ставит их заново.
COPY package.json package-lock.json ./
COPY contract/package.json contract/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

# Убираем зависимости, нужные только для сборки и тестов. Собранный
# better-sqlite3 при этом остаётся на месте, пересобирать его не придётся.
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Этап 2: запуск
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8000 \
    HOST=0.0.0.0 \
    DB_FILE=/data/booking.db \
    WEB_DIR=/app/web/dist

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/contract/openapi.yaml ./contract/openapi.yaml

# Файл базы лежит в отдельной папке: её удобно подключить томом,
# чтобы брони пережили пересоздание контейнера.
RUN mkdir -p /data && chown node:node /data

# Сервис работает не от имени root: так у него меньше прав внутри контейнера.
USER node

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8000/meeting-types').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Сначала наполняем базу демонстрационными данными, потом запускаем сервис.
# Скрипт посева идемпотентный: на непустой базе он ничего не меняет.
CMD ["sh", "-c", "node server/dist/seed.js && node server/dist/index.js"]
