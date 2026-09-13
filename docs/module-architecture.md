# DTO, contracts и domain в архитектуре backend

Этот документ объясняет, чем отличаются DTO, публичные контракты и доменные
модели в backend тренажёра Системы-112, где они находятся и как данные проходят
между этими слоями.

## Короткий ответ

Разница определяется не способом объявления TypeScript-типа и не тем, используется
ли Zod. Она определяется назначением данных и тем, кто владеет их формой.

| Понятие | Что описывает | Кто использует | Основная причина изменения |
| --- | --- | --- | --- |
| DTO | Ввод или вывод конкретного HTTP use case | Controller и application service | Изменился REST endpoint |
| Contract | Протокол обмена между компонентами | Backend, desktop app, ASR, LLM/TTS adapters | Изменился межсервисный или WebSocket-протокол |
| Domain | Смысл данных и бизнес-правила | Domain и application layers | Изменилось правило учебного звонка |

Упрощённый поток данных выглядит так:

```text
Внешний JSON / WebSocket frame
             │
             ▼
    DTO или contract schema
       проверка границы
             │
             ▼
       application layer
      преобразование данных
             │
             ▼
         domain model
       бизнес-инварианты
             │
             ▼
       application result
             │
             ▼
    DTO или contract schema
       сериализация ответа
             │
             ▼
Внешний JSON / WebSocket frame
```

## DTO

DTO расшифровывается как **Data Transfer Object**. В этом проекте DTO описывает
форму данных на конкретной HTTP-границе.

DTO отвечает на вопросы:

- какие поля принимает endpoint;
- какие поля обязательны;
- какие базовые ограничения есть у строки или числа;
- какие поля возвращаются в HTTP-ответе;
- как результат должен быть сериализован.

Примеры DTO находятся в папках модулей:

```text
src/modules/auth/dto/
src/modules/debrief/dto/
src/modules/incident-card/dto/
src/modules/scenario-catalog/dto/
```

Упрощённый DTO авторизации может выглядеть так:

```ts
const LoginDtoSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});

export class LoginDto extends createZodDto(LoginDtoSchema) {}
```

Контроллер использует DTO как тип и как правило проверки HTTP body:

```ts
@Post("login")
login(@Body() body: LoginDto): Promise<AuthSession> {
  return this.authService.login(body);
}
```

### Что DTO может проверять

DTO хорошо подходит для проверки формы сообщения:

- `email` действительно похож на email;
- строка не пустая;
- значение входит в известный enum;
- массив имеет допустимый размер;
- поле обязательно для `POST`, но опционально для `PATCH`;
- неизвестные поля отклоняются или удаляются согласно политике API.

### Что DTO не должен решать

DTO не должен принимать бизнес-решения. Например, DTO карточки происшествия
может проверить, что `services` является массивом известных служб, но не должен
решать:

- можно ли редактировать карточку после окончания звонка;
- достаточно ли собранных данных для вызова пожарной службы;
- считается ли отсутствие адреса критической ошибкой оператора;
- как это изменение повлияет на итоговую оценку.

Эти правила существуют независимо от HTTP и поэтому принадлежат domain layer.

### Почему DTO привязан к use case

Одна и та же сущность может иметь разные DTO:

```text
CreateIncidentCardDto   — поля для создания
UpdateIncidentCardDto   — частичное обновление
IncidentCardDto         — HTTP-ответ
IncidentCardSummaryDto  — сокращённый ответ для списка
```

Это нормально: DTO представляет не сущность целиком, а форму конкретной
операции.

## Contracts

Contract — это явный договор между двумя участниками обмена. Обе стороны должны
одинаково понимать названия полей, типы, обязательность, порядок сообщений и
семантику ошибок.

В проекте общие контракты находятся в `src/contracts`:

```text
src/contracts/
├── ai/
│   ├── generation.contracts.ts
│   ├── speech.contracts.ts
│   ├── voice-pipeline.contracts.ts
│   └── voice-pipeline-websocket.contracts.ts
├── types/
├── api-routes.ts
├── error-codes.ts
└── index.ts
```

К контрактам относятся:

- команды и события WebSocket;
- формат обмена backend с ASR;
- входы и выходы LLM/TTS ports;
- метаданные PCM-аудио;
- коды публичных ошибок;
- стабильные маршруты API;
- поля, которые одновременно понимают backend и desktop app.

Упрощённый WebSocket-контракт:

```ts
export const ListenStartCommandSchema = z.object({
  type: z.literal("listen.start"),
  eventId: z.uuid(),
  sessionId: z.uuid(),
  timestamp: z.iso.datetime(),
});
```

Здесь Zod нужен не потому, что это DTO, а потому что входящий WebSocket JSON
нельзя считать корректным до runtime-валидации.

### Чем contract отличается от DTO

DTO обычно принадлежит одному backend endpoint. Contract принадлежит границе,
на которой существуют как минимум две стороны.

Например:

```text
LoginDto
    владелец: AuthModule
    потребитель: POST /api/v1/auth/login

VoicePipelineServerEvent
    владельцы договора: backend и desktop app
    потребитель: WebSocket-протокол учебного звонка
```

Изменение DTO иногда ограничивается одним контроллером. Изменение контракта
может потребовать синхронного обновления backend, desktop app и отдельного
сервиса.

### Версионирование контрактов

Публичные контракты должны меняться совместимо. Добавление опционального поля
обычно безопаснее, чем переименование или удаление обязательного поля.

Если совместимость сохранить невозможно, создаётся новая версия протокола:

```text
v1 event ── продолжает работать для старого клиента
v2 event ── используется новым клиентом
```

Особенно это важно для WebSocket-событий звонка: desktop app и backend могут
обновляться не одновременно.

### Контракт не содержит бизнес-решение

Contract может разрешать передать поле `revealedFactIds`, но он не решает,
имеет ли модель право раскрыть эти факты. Это проверяет Scenario Engine.

```text
Contract:
    revealedFactIds должен быть массивом строк

Domain:
    каждый указанный факт должен быть разрешён на текущем ходе
```

## Domain

Domain описывает предметную область тренажёра Системы-112. Он отвечает не за
формат передачи данных, а за их смысл и допустимое поведение системы.

Примеры domain-кода:

```text
src/modules/scenario-engine/domain/
src/modules/dialogue-generation/domain/
src/modules/speech-synthesis/domain/
src/modules/voice-pipeline/domain/
src/modules/call-recording/domain/
src/modules/debrief/domain/
```

В domain находятся:

- состояния учебного звонка;
- факты сценария и условия их раскрытия;
- шкала паники заявителя;
- детерминированный выбор реакции;
- правила оценки оператора;
- критические ошибки;
- правила сборки WAV и сведения каналов;
- доменные ошибки и инварианты.

Например, domain-функция может определять, доступен ли факт заявителю:

```ts
export const canRevealFact = (
  fact: ScenarioFact,
  state: ScenarioState,
): boolean => {
  // Проверка условия раскрытия без HTTP, NestJS и PostgreSQL.
};
```

Или вычислять изменение уровня паники:

```ts
export const changePanicLevel = (
  current: PanicLevel,
  signal: OperatorSignal,
): PanicLevel => {
  // Детерминированный переход с учётом floor и ceiling.
};
```

### Главный признак domain-кода

Правило остаётся истинным при любой технологии доставки данных.

Например, запрет раскрытия скрытого факта должен работать одинаково, если
реплика пришла:

- через WebSocket;
- из REST smoke-теста;
- из локального тестового сценария;
- из будущего другого транспорта.

Поэтому domain не должен знать о `Request`, `Response`, WebSocket client,
Drizzle query или формате ответа Alice AI.

### Domain содержит поведение, а не только типы

Интерфейс сам по себе ещё не делает файл доменным. Domain ценен тем, что
инкапсулирует правила:

```ts
interface CallState {
  status: "offered" | "active" | "completed";
}
```

Это просто описание данных. Доменным оно становится вместе с поведением:

```ts
export const acceptCall = (state: CallState): CallState => {
  if (state.status !== "offered") {
    throw new InvalidCallTransitionError(state.status, "active");
  }

  return { ...state, status: "active" };
};
```

## Один объект на трёх уровнях

Рассмотрим обновление карточки происшествия.

### 1. DTO принимает HTTP-запрос

```ts
const UpdateIncidentCardDtoSchema = z.object({
  address: z.string().trim().min(1).optional(),
  services: z
    .array(z.enum(["fire", "police", "medical", "gas"]))
    .optional(),
});
```

DTO гарантирует, что транспортная форма корректна.

### 2. Application layer создаёт команду

```ts
await incidentCardService.update({
  trainingSessionId,
  operatorId: request.user.sub,
  patch: body,
});
```

Application service загружает текущую карточку и состояние звонка через ports.

### 3. Domain проверяет смысл

```ts
if (call.status === "completed") {
  throw new IncidentCardLockedError();
}
```

Domain может дополнительно определить:

- разрешено ли изменение на текущем этапе;
- выполнен ли обязательный пункт;
- является ли действие оператора критической ошибкой;
- как изменение влияет на детерминированную оценку.

### 4. Infrastructure сохраняет результат

```text
IncidentCardService
        │
        ▼
IncidentCardStorePort
        │
        ▼
DrizzleIncidentCardStore
        │
        ▼
PostgreSQL
```

### 5. Contract описывает внешнее событие

```json
{
  "type": "incident-card.updated",
  "eventId": "...",
  "sessionId": "...",
  "timestamp": "...",
  "payload": {
    "changedFields": ["address", "services"]
  }
}
```

Desktop app получает событие по согласованному контракту. При этом внутренние
доменные объекты и структура таблиц PostgreSQL ему не раскрываются.

## Пример из голосового конвейера

В голосовом сценарии различия особенно заметны:

```text
1. WebSocket contract
   Проверяет команду listen.start или listen.stop.

2. Transport
   VoicePipelineGateway принимает JSON и бинарные PCM-фреймы.

3. Application
   VoicePipelineService координирует ASR, Scenario Engine, LLM и TTS.

4. Domain
   Scenario Engine определяет разрешённые факты и состояние заявителя.

5. Provider contract
   LLM/TTS adapter получает строго типизированный запрос.

6. WebSocket contract
   Backend отправляет reply.text, audio.start и audio.done.
```

Схематично:

```text
Desktop app
    │ WebSocket contract
    ▼
VoicePipelineGateway
    │ application command
    ▼
VoicePipelineService
    ├── Scenario Engine domain rules
    ├── LLM port → Alice AI adapter
    └── TTS port → MLX-Audio / vLLM-Omni adapter
    │
    ▼
WebSocket server event contract
    │
    ▼
Desktop app
```

LLM contract может содержать `revealedFactIds`, но окончательное решение
принимает domain:

```text
LLM предложила fact-17
        │
        ▼
Contract schema: это корректный массив идентификаторов
        │
        ▼
Scenario Engine: fact-17 сейчас запрещён
        │
        ▼
fact-17 удаляется, событие fact.rejected записывается в журнал
```

## Почему DTO и contract иногда выглядят одинаково

Оба часто объявляются через `z.object()`, потому что оба работают на недоверенной
границе. Но используемая библиотека не определяет архитектурную роль.

```ts
// DTO: HTTP body одного endpoint
const RefreshTokenDtoSchema = z.object({
  refreshToken: z.string().min(1),
});

// Contract: событие общего WebSocket-протокола
const AudioDoneEventSchema = z.object({
  eventId: z.uuid(),
  sessionId: z.uuid(),
  timestamp: z.iso.datetime(),
  type: z.literal("audio.done"),
  payload: AudioDonePayloadSchema,
});
```

Оба используют Zod, но первый принадлежит `AuthModule`, а второй является
договором backend с desktop app.

## Почему нельзя использовать одну модель везде

Один универсальный интерфейс для HTTP, domain и PostgreSQL сначала кажется
удобным, но быстро связывает независимые части системы.

Предположим, таблица хранит:

```ts
interface IncidentCardRow {
  id: string;
  sessionId: string;
  payloadJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}
```

Desktop app не обязан знать о `payloadJson` и внутренних timestamp базы. Domain
не обязан знать, в одной JSONB-колонке хранится карточка или в десяти обычных.
HTTP PATCH не обязан принимать все поля существующей записи.

Поэтому используются преобразования:

```text
UpdateIncidentCardDto
        ↓
UpdateIncidentCardCommand
        ↓
IncidentCard domain model
        ↓
IncidentCard persistence record
        ↓
IncidentCardDto / WebSocket event
```

Явное преобразование может добавить несколько строк кода, зато изменение базы
не ломает API, а изменение API не заставляет менять доменные правила.

## Отличие от схемы базы данных

Drizzle schema — это ещё один отдельный вид модели:

```text
drizzle/schema/*.schema.ts
```

Она отвечает на вопросы:

- какие таблицы и колонки существуют;
- какие используются SQL-типы;
- какие поля nullable;
- какие есть внешние ключи и индексы.

Сравнение четырёх видов моделей:

| Вид | Главный вопрос |
| --- | --- |
| DTO | Что принимает или возвращает endpoint? |
| Contract | Как две стороны обмениваются данными? |
| Domain | Что эти данные означают и какие правила действуют? |
| Drizzle schema | Как данные физически сохраняются в PostgreSQL? |

## Допустимые направления зависимостей

Предпочтительные зависимости:

```text
controller / gateway
        │
        ▼
application service
        │
        ├────────► domain
        │
        └────────► port interface
                         ▲
                         │ implements
                  infrastructure adapter
```

Практические правила:

- controller может импортировать DTO и application service;
- gateway может импортировать WebSocket contracts и application service;
- application может импортировать domain и ports;
- infrastructure может импортировать ports и Drizzle/provider SDK;
- domain не импортирует controller, DTO, Drizzle или provider adapter;
- общий contract не должен импортировать NestJS controller или базу данных.

## Типичные ошибки

### Бизнес-правило в DTO

Плохо:

```ts
const EndCallDtoSchema = z.object({
  completedChecklistItems: z.number().min(5),
});
```

Если минимальное число пунктов зависит от версии сценария, Zod DTO не имеет
достаточного контекста. Это правило должен проверять Scenario Engine.

### SQL в controller

Плохо:

```ts
@Get(":id")
async getCard(@Param("id") id: string) {
  return db.select().from(incidentCards).where(eq(incidentCards.id, id));
}
```

Controller начинает отвечать одновременно за HTTP, хранение и бизнес-логику.
Правильная цепочка: controller → application service → store port → Drizzle
adapter.

### Provider response как domain model

Плохо передавать сырой ответ Alice AI глубоко в систему. Сначала adapter должен
преобразовать его в общий LLM contract, после чего Scenario Engine проверяет
доменные ограничения.

### Drizzle row как публичный API

Возврат строки базы напрямую связывает REST API со схемой PostgreSQL и может
случайно раскрыть внутренние поля. Для ответа используется DTO или публичный
contract.

## Как определить правильную папку

Для нового типа или функции нужно последовательно задать вопросы.

### Это форма конкретного REST-запроса или ответа?

Поместить в `dto/` соответствующего модуля.

Примеры:

```text
LoginDto
RefreshTokenDto
UpdateIncidentCardDto
DebriefDto
```

### Эту структуру должны одинаково понимать несколько компонентов?

Поместить в `src/contracts` или в явно версионированный межсервисный пакет.

Примеры:

```text
VoicePipelineClientCommand
VoicePipelineServerEvent
TtsSynthesisRequest
AsrTranscriptEvent
ErrorCode
```

### Это понятие или правило учебного звонка?

Поместить в `domain/` соответствующего модуля.

Примеры:

```text
PanicLevel
DisclosureCondition
CallStateTransition
CriticalOperatorError
EvaluationResult
```

### Это структура хранения PostgreSQL?

Поместить в `drizzle/schema` и изменить базу через новую миграцию.

## Итоговая памятка

```text
DTO
    форма одного HTTP use case
    валидирует транспортный ввод
    может отличаться для create, update, list и details

Contract
    стабильный протокол между сторонами
    валидируется на runtime-границе
    меняется совместимо или версионируется

Domain
    язык и правила предметной области
    не зависит от транспорта и хранения
    обеспечивает инварианты и воспроизводимость

Drizzle schema
    физическая модель PostgreSQL
    изменяется через миграции
```

Самая важная проверка: если завтра REST заменить другим транспортом, доменные
правила не должны измениться. Если PostgreSQL заменить другим хранилищем,
публичные контракты не должны измениться. Если desktop app обновит внешний вид,
Scenario Engine должен продолжать принимать те же детерминированные решения.
