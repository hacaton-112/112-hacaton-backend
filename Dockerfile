# Версии совпадают с теми, что у разработчика: Bun — из packageManager в
# package.json, Node — тот, под которым локально работает Nest CLI.
ARG BUN_VERSION=1.4.0
ARG NODE_VERSION=24.19.0

FROM oven/bun:${BUN_VERSION} AS bun

# ── Зависимости ───────────────────────────────────────────────────────────────
# Сборка идёт на Node, а не в образе Bun. В образе Bun команда `node` — ссылка
# на сам Bun, а он разрешает алиасы `@/…` из tsconfig: Nest CLI принимает их за
# установленные пакеты и оставляет в dist как есть, и собранный backend падает
# на первом же импорте. Bun здесь только ставит пакеты по bun.lock.
FROM node:${NODE_VERSION}-slim AS deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
# Отдельный слой: пока lock-файл не менялся, пересборка после правки кода не
# скачивает пакеты заново.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Сборка ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN bun run build

# ── Инструменты ───────────────────────────────────────────────────────────────
# Полный исходник и dev-зависимости для разовых команд: миграции (drizzle-kit),
# сид сценариев и создание учётной записи. В рабочий образ это не попадает.
FROM build AS tools
ENV NODE_ENV=production
CMD ["bun", "run", "db:migrate"]

# ── Рабочий образ ─────────────────────────────────────────────────────────────
FROM oven/bun:${BUN_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    METRICS_HOST=0.0.0.0 \
    METRICS_PORT=9464

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production \
    && rm -rf /root/.bun/install/cache

COPY --from=build /app/dist ./dist
# Референсные голоса читаются во время работы: без них режим Base ICL не
# стартует.
COPY assets ./assets
# Миграции применяет сам контейнер перед стартом: отдельная разовая задача
# оставляла бы в compose завершившийся контейнер.
COPY drizzle/migrate.ts ./drizzle/migrate.ts
COPY drizzle/migrations ./drizzle/migrations

# Winston пишет файлы в ./logs; процесс работает не от root, и каталог должен
# принадлежать ему.
RUN mkdir -p /app/logs && chown -R bun:bun /app/logs
USER bun

EXPOSE 3000 9464

# Проверка идёт через сам API: health отвечает, только когда жива и база.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["sh", "-c", "bun drizzle/migrate.ts && exec bun dist/src/main.js"]
