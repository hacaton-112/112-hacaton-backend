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
- безопасная сборка потокового LLM-ответа с проверкой фактов и fallback;
- потоковый адаптер Alice AI LLM Flash через OpenAI-compatible API;
- потоковая TTS-оркестрация с проверкой PCM-протокола, retry и latency-метриками;
- потоковый адаптер Qwen3-TTS через стандартный MLX-Audio API;
- типизированный voice pipeline от проверенной LLM-реплики до потокового PCM;
- rate limiting и security headers.

`AliceAiAdapterModule` предоставляет `LLM_PORT` только для
`DialogueGenerationModule`, а `QwenTtsAdapterModule` предоставляет `TTS_PORT`
только для `SpeechSynthesisModule`. `AiGatewayModule` агрегирует оба адаптера для
будущих composition roots, не создавая взаимной зависимости их конфигураций.
Эти модули ещё не подключены к `CoreModule`: публичный transport отсутствует, а
обычный запуск backend не должен требовать AI runtime или Alice AI credentials.
Авторизация и бизнес-модули намеренно не зафиксированы. Следующими вертикальными
модулями должны стать `scenarios`, `training-sessions`, `scenario-engine`,
`incident-cards`, `evaluation` и голосовой pipeline.

`SpeechSynthesisModule` валидирует последовательность и метаданные PCM-чанков,
сохраняет backpressure и не буферизует аудио. Повтор допускается только до выдачи
первого чанка, чтобы клиент не воспроизводил один фрагмент дважды.

## Voice pipeline

`VoicePipelineModule` объединяет `DialogueGenerationModule` и
`SpeechSynthesisModule` в поток `operator text → LLM → validation → TTS → PCM`.
Сервис сначала полностью собирает структурированный LLM-ответ, проверяет его через
Zod и разрешённые Scenario Engine факты и только затем запускает TTS. Это не
позволяет передать в синтез непроверенные JSON-дельты или выдуманные факты.

Pipeline выдаёт типизированные события с validated reply, PCM-чанками и полными
generation, synthesis и end-to-end latency-метриками. Backpressure и исходные
`Uint8Array` сохраняются. Внутренние retry выполняются только соответствующими
generation/TTS-сервисами; pipeline не повторяет LLM после ошибки синтеза.

`VoicePipelineModule` пока не подключён к `CoreModule`: ASR и публичный
HTTP/WebSocket transport будут добавлены отдельными изменениями.

## Alice AI

Адаптер использует встроенный `fetch` и потоковый OpenAI-compatible endpoint
Alice AI без дополнительного SDK. В запрос передаётся только минимальный контекст:
персонаж, разрешённые Scenario Engine факты, последние реплики и текущая реплика
оператора. Ответ ограничен строгой JSON Schema и повторно валидируется backend.

Для включения модуля потребуются `YANDEX_AI_API_KEY` и
`YANDEX_AI_FOLDER_ID`. Опциональные настройки и их значения по умолчанию приведены
в `.env.example`. Нельзя добавлять ключи или реальные записи звонков в репозиторий
и логи.

## Qwen3-TTS

Адаптер вызывает стандартный endpoint MLX-Audio `POST /v1/audio/speech` встроенным
`fetch` и передаёт клиенту поток raw PCM S16LE без Base64 и WAV-заголовков. Формат
фиксирован как mono 24 kHz. Последний непустой PCM-чанк помечается `isFinal`, а
разделённые HTTP-границей `int16` samples безопасно объединяются.

Параметры локального сервера, модели, streaming interval и timeout приведены в
`.env.example`. Python runtime, установка MLX-Audio и загрузка модели остаются
отдельной задачей; эта ветка не выполняет live-запросы и не добавляет Node.js SDK.

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
