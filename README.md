# Backend тренажёра Системы-112

Минимальный инфраструктурный каркас NestJS для desktop-тренажёра диспетчеров.
Старые домены шаблонного проекта удалены; сохранены только применимые к кейсу
архитектурные паттерны и интеграция PostgreSQL через Drizzle ORM.

## Что уже есть

- NestJS 11 и URI-версионирование API (`/api/v1`);
- централизованная конфигурация с проверкой переменных окружения;
- PostgreSQL, Drizzle ORM и команды управления миграциями;
- health check базы данных;
- единый формат API-ошибок и Zod-валидация;
- request logging с `requestId`;
- audit service для значимых действий с привязкой к учебной сессии;
- строгие Zod-контракты и потоковые порты для LLM и TTS;
- rate limiting и security headers.

`AiGatewayModule` пока не подключён к приложению: конкретные адаптеры LLM и TTS
будут зарегистрированы после их реализации. Авторизация и бизнес-модули пока
намеренно не зафиксированы. Следующими вертикальными модулями должны стать
`scenarios`, `training-sessions`, `scenario-engine`, `incident-cards`,
`evaluation`, `dialogue-generation` и `speech-synthesis`.

## Структура

```text
src/
  common/       # общие ошибки, фильтры, interceptors и утилиты
  contracts/    # публичные константы и типы API
  core/         # конфигурация и подключение инфраструктуры
  modules/      # изолированные NestJS-модули
drizzle/
  schema/       # Drizzle-схемы
  migrations/   # генерируется drizzle-kit
```

## Локальный запуск

```bash
cp .env.example .env
docker compose up -d postgres
bun install
bun run db:generate
bun run db:migrate
bun run start:dev
```

## Проверки

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

## Архитектурные ограничения

- `Scenario Engine` остаётся единственным источником истины по происшествию.
- LLM формулирует ответы только из разрешённых движком фактов.
- Оценка действий оператора рассчитывается детерминированно.
- ASR, LLM и TTS подключаются через заменяемые адаптеры.
- Публичные REST/WebSocket-контракты должны быть типизированы и версионированы.
