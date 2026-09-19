import { z } from "zod";

/** Ступень паники заявителя: ноль — спокоен, четыре — не слышит вопросов. */
export const PanicLevelSchema = z.number().int().min(0).max(4);

export const CallStageSchema = z.enum([
  "offered",
  "conversation",
  "wrap_up",
  "ended",
  "declined",
]);

/**
 * Что известно о месте до разговора: область автоопределения, а не точка.
 * Точный адрес оператор выясняет сам.
 */
export const CallLocatorSchema = z.object({
  centerLat: z.number(),
  centerLon: z.number(),
  radiusMeters: z.number(),
  label: z.string(),
  accuracy: z.enum(["identified", "approximate", "unavailable"]),
  callerNumber: z.string(),
  previouslyCalled: z.boolean(),
});

const SnapshotShape = {
  /** Учебная сессия звонка: по ней адресуются карточка и разбор. */
  sessionId: z.string(),
  stage: CallStageSchema,
  panicLevel: PanicLevelSchema,
  checklistTotal: z.number().int(),
  checklistSatisfied: z.number().int(),
  answerNormSeconds: z.number().int(),
};

/**
 * События сервера. Схемы повторяют контракты backend, но не строгие: новое
 * поле в протоколе не должно ронять окно оператора посреди звонка.
 */
export const CallServerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("call.offered"),
    scenarioCode: z.string(),
    title: z.string(),
    locator: CallLocatorSchema.nullable(),
    ...SnapshotShape,
  }),
  z.object({
    type: z.literal("call.accepted"),
    openingLine: z.string(),
    ...SnapshotShape,
  }),
  z.object({
    type: z.literal("call.state"),
    revealedFactKeys: z.array(z.string()),
    ...SnapshotShape,
  }),
  z.object({
    type: z.literal("call.resumed"),
    scenarioCode: z.string(),
    title: z.string(),
    locator: CallLocatorSchema.nullable(),
    revealedFactKeys: z.array(z.string()),
    dialogue: z.array(
      z.object({ role: z.enum(["operator", "caller"]), text: z.string() }),
    ),
    offeredAt: z.string(),
    answeredAt: z.string().nullable(),
    recoveryWindowSeconds: z.number().int().positive(),
    ...SnapshotShape,
  }),
  z.object({
    type: z.literal("call.ended"),
    reason: z.enum([
      "operator",
      "declined",
      "scenario",
      "timeout",
      "instructor",
    ]),
    ...SnapshotShape,
  }),
  z.object({
    type: z.literal("listen.started"),
    streamId: z.string(),
    sampleRate: z.number(),
  }),
  z.object({
    type: z.literal("listen.stopped"),
    streamId: z.string(),
    transcript: z.string(),
    audioMs: z.number(),
    processingMs: z.number(),
  }),
  z.object({
    type: z.literal("listen.transcript"),
    streamId: z.string(),
    transcript: z.string(),
    audioMs: z.number(),
    processingMs: z.number(),
  }),
  z.object({
    type: z.literal("reply.text"),
    text: z.string(),
    emotion: z.string(),
    intensity: z.number(),
    source: z.enum(["model", "fallback", "prepared"]),
  }),
  z.object({
    type: z.literal("audio.start"),
    streamId: z.string(),
    sampleRate: z.number().int().positive(),
  }),
  z.object({ type: z.literal("audio.done") }),
  /** RMS обработанного TTS из Rust; используется только индикатором громкости. */
  z.object({
    type: z.literal("audio.level"),
    level: z.number().min(0).max(1),
  }),
  z.object({ type: z.literal("request.cancelled") }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
  /** Добавлено нативной стороной: webview больше не владеет сокетом. */
  z.object({ type: z.literal("socket.closed") }),
  z.object({ type: z.literal("socket.error"), message: z.string() }),
]);

export const ScenarioSummarySchema = z.object({
  scenarioVersionId: z.string(),
  code: z.string(),
  title: z.string(),
  summary: z.string(),
  category: z.string(),
  difficulty: z.number().int(),
  answerNormSeconds: z.number().int(),
  /** Сколько по замыслу автора длится разговор; старый backend его не шлёт. */
  expectedDurationSeconds: z.number().int().optional(),
  version: z.number().int(),
});

export const ScenarioListSchema = z.object({
  scenarios: z.array(ScenarioSummarySchema),
});

/** Commands initiated by the webview and sent through the native call transport. */
export type CallClientCommand =
  | { type: "accept" | "decline" | "end" }
  | { type: "resume"; sessionId: string; resumeListening: boolean };

/**
 * Состояние звонка в окне оператора.
 *
 * Не то же, что `CallStage`: тот описывает стадию на backend (включая
 * `wrap_up` и `declined`), а это — что именно показывает рабочее место.
 * Переход между ними делает `use-call`.
 */
export type CallState = "idle" | "ringing" | "active" | "ended";

export type CallStage = z.infer<typeof CallStageSchema>;
export type CallLocator = z.infer<typeof CallLocatorSchema>;
export type CallServerEvent = z.infer<typeof CallServerEventSchema>;
export type ScenarioSummary = z.infer<typeof ScenarioSummarySchema>;
