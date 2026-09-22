# syntax=docker/dockerfile:1
# Точка входа: NGINX с TLS, API/WS backend-а и собранный веб-клиент.
#
# Клиент лежит в соседнем репозитории trainer-client и приходит сюда отдельным
# контекстом `web-src` (см. docker-compose.yml). Сборка внутри образа: на
# сервере не нужны ни bun, ни готовый dist, а версия клиента фиксируется тегом.
FROM oven/bun:1 AS web
WORKDIR /app
COPY --from=web-src package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --from=web-src index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY --from=web-src public ./public
COPY --from=web-src src ./src
# .env клиента не копируется: без VITE_API_URL клиент ходит на origin страницы,
# то есть сюда же, и голосовой сокет сам становится wss://.
RUN bun run build

FROM nginx:1.28-alpine
COPY --from=web /app/dist /usr/share/nginx/html
