# Backend тренажёра Системы-112

Минимальный инфраструктурный каркас NestJS для desktop-тренажёра диспетчеров.
Старые домены шаблонного проекта удалены; сохранены только применимые к кейсу
архитектурные паттерны и интеграция PostgreSQL через Drizzle ORM.

## Что уже есть

- NestJS 11 и URI-версионирование API (`/api/v1`);
- централизованная конфигурация с проверкой переменных окружения;
- PostgreSQL, Drizzle ORM и команды управления миграциями;
- health check базы данных;
- JWT-авторизация и учётные записи операторов;
- единый формат API-ошибок и Zod-валидация;
- request logging с `requestId`;
- audit service для значимых действий с привязкой к учебной сессии;
- строгие Zod-контракты и потоковые порты для LLM и TTS;
- безопасная сборка потокового LLM-ответа с проверкой фактов и fallback;
- потоковый адаптер Alice AI LLM Flash через OpenAI-compatible API;
- потоковая TTS-оркестрация с проверкой PCM-протокола, retry и latency-метриками;
- заменяемые потоковые адаптеры Qwen3-TTS для MLX-Audio и vLLM-Omni;
- типизированный voice pipeline от проверенной LLM-реплики до потокового PCM;
- WebSocket transport для потоковой передачи validated reply и raw PCM клиенту;
- rate limiting и security headers.

`AliceAiAdapterModule` предоставляет `LLM_PORT` только для
`DialogueGenerationModule`, а `QwenTtsAdapterModule` предоставляет `TTS_PORT`
только для `SpeechSynthesisModule`. `AiGatewayModule` агрегирует оба адаптера для
будущих composition roots, не создавая взаимной зависимости их конфигураций.
`VoicePipelineModule` подключён к `CoreModule`; Alice AI credentials проверяются
при запуске, а для обработки голосовой команды должен быть доступен выбранный TTS
runtime. Следующими вертикальными модулями должны стать `scenarios`,
`training-sessions`, `scenario-engine`, `incident-cards` и `evaluation`.

`SpeechSynthesisModule` валидирует последовательность и метаданные PCM-чанков,
сохраняет backpressure и не буферизует аудио. Повтор допускается только до выдачи
первого чанка, чтобы клиент не воспроизводил один фрагмент дважды.

## Авторизация

`AuthModule` выдаёт JWT доступа по паролю: `POST /api/v1/auth/login` возвращает
`accessToken`, его срок жизни и профиль, а `GET /api/v1/auth/me` отдаёт текущего
пользователя по заголовку `Authorization: Bearer <token>`. Проверку выполняет
`AccessTokenVerifier`: он извлекает токен, сверяет подпись с закреплённым
алгоритмом и валидирует claims. Закрытые маршруты помечаются `JwtAuthGuard`.
Пароли хранятся как bcrypt-хеши, логин ограничен 5 попытками в минуту, а неверный
пароль и несуществующий email отвечают одинаково — по коду
`AUTH_LOGIN_INVALID_CREDENTIALS`.

Публичной регистрации нет: учётные записи заводит администратор.

```bash
bun run user:create -- operator@system112.ru "operator-1" "Анна Смирнова" [role]
```

Роли — `operator` (по умолчанию), `instructor`, `admin`. Обязательная переменная
окружения `JWT_SECRET` (минимум 32 символа), срок жизни токена настраивается
через `JWT_ACCESS_TTL_SECONDS`.

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

### WebSocket transport

Клиент подключается к `ws://<host>:<port>/api/v1/voice-pipeline/stream` и отправляет
текстовую команду `{"type":"speak","operatorText":"...","voiceId":"..."}`.
Рукопожатие требует тот же заголовок `Authorization: Bearer <token>`, что и REST:
без валидного токена соединение закрывается кодом `4401`. Браузерный `WebSocket`
заголовки задавать не умеет, поэтому транспорт рассчитан на нативный клиент.
Backend последовательно отправляет JSON-события `reply.text`, `audio.start`, затем
binary WebSocket frames с raw PCM S16LE и завершает ответ событием `audio.done`.
Все JSON-события содержат `eventId`, `sessionId`, `timestamp` и `requestId`.

На одном соединении выполняется только один запрос. Новая команда `speak` отменяет
предыдущий поток; явная команда `{"type":"cancel"}` возвращает
`request.cancelled`. PCM передаётся без Base64 и промежуточного накопления, а
отправка следующего чанка ждёт завершения предыдущей WebSocket-операции.

Пока Scenario Engine не реализован, gateway не принимает факты сценария от
клиента. Для локальной сквозной проверки можно явно включить server-owned
синтетический сценарий через `VOICE_PIPELINE_DEMO_ENABLED=true`. По умолчанию он
выключен, и команда `speak` завершается безопасной ошибкой `context-unavailable`.
После появления Scenario Engine его реализация заменит
`VoicePipelineRequestFactory`, не меняя публичный WebSocket-протокол.

## Alice AI

Адаптер использует встроенный `fetch` и потоковый OpenAI-compatible endpoint
Alice AI без дополнительного SDK. В запрос передаётся только минимальный контекст:
персонаж, разрешённые Scenario Engine факты, последние реплики и текущая реплика
оператора. Provider JSON Schema фиксирует строгую структуру ответа совместимым с
Alice AI подмножеством, а все ограничения значений и разрешённые факты повторно
проверяются полным Zod-контрактом на backend. `safety_identifier` не передаётся,
поскольку Alice AI LLM Flash отклоняет этот параметр; исходный `sessionId` также
не покидает backend.

Для включения модуля потребуются `YANDEX_AI_API_KEY` и
`YANDEX_AI_FOLDER_ID`. Опциональные настройки и их значения по умолчанию приведены
в `.env.example`. Нельзя добавлять ключи или реальные записи звонков в репозиторий
и логи.

## Qwen3-TTS

`QwenTtsAdapterModule` выбирает runtime через `QWEN_TTS_PROVIDER`. Значение
`mlx-audio` использует нативный MLX-Audio на Apple Silicon, а `vllm-omni` —
vLLM-Omni, например в Linux-контейнере с CUDA. Оба адаптера реализуют один
`TTS_PORT` и передают клиенту raw PCM S16LE без Base64 и WAV-заголовков. Формат
фиксирован как mono 24 kHz. Последний непустой PCM-чанк помечается `isFinal`, а
разделённые HTTP-границей `int16` samples безопасно объединяются.

Provider-specific запросы разделены: MLX-Audio получает `lang_code`, `instruct`
и `streaming_interval`, а vLLM-Omni — `language`, `instructions`,
`max_new_tokens` и обязательный `stream_format: "audio"`. Поскольку vLLM-Omni не
поддерживает изменение `speed` при потоковой выдаче, `speechRate` преобразуется в
контролируемую текстовую инструкцию. Параметры обоих runtime приведены в
`.env.example`.

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

### Ручная проверка AI pipeline

После заполнения `.env` и запуска выбранного Qwen3-TTS runtime можно независимо
проверить каждый этап на синтетическом сценарии:

```bash
bun run smoke:voice-pipeline -- generation
bun run smoke:voice-pipeline -- tts
bun run smoke:voice-pipeline -- pipeline
```

Вторым аргументом для TTS и pipeline можно передать voice ID, например:

```bash
bun run smoke:voice-pipeline -- tts Vivian
```

Режим `generation` проверяет Alice AI, SSE, JSON и allowed-fact validation без TTS.
Режим `tts` проверяет выбранный Qwen3-TTS runtime без Alice AI. `pipeline`
запускает всю цепочку и при недоступности LLM также позволяет проверить озвучивание
безопасной fallback-реплики. Скрипт не выводит credentials; созданные `.pcm` и
`.wav` файлы сохраняются в системной временной директории, а точные пути печатаются
в результате.

Если Alice AI возвращает `400`, запустите поэтапную проверку совместимости запроса:

```bash
bun run diagnose:alice-ai
```

Диагностика останавливается на первом несовместимом этапе и выводит только
ограниченный ответ ошибки с удалёнными API key и folder ID.

## Архитектурные ограничения

- `Scenario Engine` остаётся единственным источником истины по происшествию.
- LLM формулирует ответы только из разрешённых движком фактов.
- Оценка действий оператора рассчитывается детерминированно.
- ASR, LLM и TTS подключаются через заменяемые адаптеры.
- Публичные REST/WebSocket-контракты должны быть типизированы и версионированы.
