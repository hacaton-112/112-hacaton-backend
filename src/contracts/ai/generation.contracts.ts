import { z } from "zod";

const MAX_IDENTIFIER_LENGTH = 128;
const MAX_FACT_VALUE_LENGTH = 1_000;
const MAX_OPERATOR_TEXT_LENGTH = 1_000;
export const MAX_CALLER_REPLY_LENGTH = 500;
export const MAX_RECENT_TURNS = 8;
export const MAX_TOLD_FACTS = 64;
export const MAX_ALLOWED_FACTS = 64;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const uniqueBy = <T>(
  values: readonly T[],
  select: (value: T) => string,
): boolean => new Set(values.map(select)).size === values.length;

export const AiIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_IDENTIFIER_LENGTH)
  .regex(identifierPattern);

export const FactIdSchema = AiIdentifierSchema;

export const CallerEmotionSchema = z.enum([
  "neutral",
  "calm",
  "anxious",
  "panic",
  "pain",
  "anger",
  "confusion",
]);

export const CallerReplyTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_CALLER_REPLY_LENGTH);

/**
 * Границы окраски голоса живут отдельными константами: их знает и схема, и
 * поставщик модели, которому диапазон приходится диктовать явно.
 */
export const EMOTION_INTENSITY_RANGE = { min: 0, max: 1 } as const;
export const SPEECH_RATE_RANGE = { min: 0.5, max: 2 } as const;

export const EmotionIntensitySchema = z
  .number()
  .min(EMOTION_INTENSITY_RANGE.min)
  .max(EMOTION_INTENSITY_RANGE.max);

export const SpeechRateSchema = z
  .number()
  .min(SPEECH_RATE_RANGE.min)
  .max(SPEECH_RATE_RANGE.max);

/**
 * Смысл хода выбирает Scenario Engine. Модель получает уже выбранный способ
 * реакции и отвечает только за естественную формулировку разрешённых фактов.
 */
export const CallerReactionActSchema = z.enum([
  "answer",
  "clarify",
  "acknowledge",
  "hesitate",
  "self-correct",
  "repeat",
  "emotional-reaction",
  "panic-refusal",
]);

export const MinimumResponseDelayMsSchema = z.number().int().min(0).max(1_500);

export const CallerTurnPlanSchema = z
  .object({
    reactionAct: CallerReactionActSchema,
    /**
     * Факты, на которых должна быть сосредоточена именно эта реплика. Поле
     * опционально для старых диагностических клиентов; Scenario Engine всегда
     * передаёт его явно.
     */
    focusFactIds: z
      .array(FactIdSchema)
      .max(MAX_ALLOWED_FACTS)
      .refine((factIds) => uniqueBy(factIds, (factId) => factId), {
        message: "Focused fact IDs must be unique",
      })
      .optional(),
    /**
     * Минимальная пауза от конца реплики оператора до запуска TTS. Если LLM
     * уже думала дольше, искусственная задержка не добавляется.
     */
    minimumResponseDelayMs: MinimumResponseDelayMsSchema,
  })
  .strict();

export const ScenarioFactSchema = z
  .object({
    id: FactIdSchema,
    value: z.string().trim().min(1).max(MAX_FACT_VALUE_LENGTH),
  })
  .strict();

export const DialogueTurnSchema = z
  .object({
    role: z.enum(["operator", "caller"]),
    text: z.string().trim().min(1).max(MAX_CALLER_REPLY_LENGTH),
  })
  .strict();

export const CallerPersonaSchema = z
  .object({
    id: AiIdentifierSchema,
    description: z.string().trim().min(1).max(2_000),
    language: z.literal("Russian"),
  })
  .strict();

export const CallerReplySchema = z
  .object({
    text: CallerReplyTextSchema,
    emotion: CallerEmotionSchema,
    intensity: EmotionIntensitySchema,
    speechRate: SpeechRateSchema,
    revealedFactIds: z
      .array(FactIdSchema)
      .max(MAX_ALLOWED_FACTS)
      .refine((factIds) => uniqueBy(factIds, (factId) => factId), {
        message: "Revealed fact IDs must be unique",
      }),
    endCall: z.boolean(),
  })
  .strict();

export const GenerationContextSchema = z
  .object({
    persona: CallerPersonaSchema,
    allowedFacts: z
      .array(ScenarioFactSchema)
      .max(MAX_ALLOWED_FACTS)
      .refine((facts) => uniqueBy(facts, ({ id }) => id), {
        message: "Fact IDs must be unique",
      }),
    recentTurns: z.array(DialogueTurnSchema).max(MAX_RECENT_TURNS),
    // Что заявитель уже сообщил за звонок. Окно недавних реплик короткое, и без
    // этого списка он на пятом ходу пересказывает то же, что на втором.
    alreadyToldFactIds: z.array(FactIdSchema).max(MAX_TOLD_FACTS).optional(),
    // Поле опционально для совместимости с диагностическими клиентами старой
    // версии. Настоящий Scenario Engine всегда его заполняет.
    turnPlan: CallerTurnPlanSchema.optional(),
  })
  .strict()
  .superRefine((context, refinement) => {
    const allowedFactIds = new Set(context.allowedFacts.map(({ id }) => id));

    for (const factId of context.turnPlan?.focusFactIds ?? []) {
      if (!allowedFactIds.has(factId)) {
        refinement.addIssue({
          code: "custom",
          path: ["turnPlan", "focusFactIds"],
          message: `Focused fact is not allowed on this turn: ${factId}`,
        });
      }
    }
  });

export const GenerateCallerReplyRequestSchema = z
  .object({
    requestId: AiIdentifierSchema,
    sessionId: AiIdentifierSchema,
    scenarioVersionId: AiIdentifierSchema,
    operatorText: z.string().trim().min(1).max(MAX_OPERATOR_TEXT_LENGTH),
    context: GenerationContextSchema,
    /** Безопасная реплика от Scenario Engine на случай двух ошибок модели. */
    fallbackReply: CallerReplySchema.optional(),
  })
  .strict()
  .superRefine((request, refinement) => {
    const allowedFactIds = new Set(
      request.context.allowedFacts.map(({ id }) => id),
    );

    for (const factId of request.fallbackReply?.revealedFactIds ?? []) {
      if (!allowedFactIds.has(factId)) {
        refinement.addIssue({
          code: "custom",
          path: ["fallbackReply", "revealedFactIds"],
          message: `Fallback fact is not allowed on this turn: ${factId}`,
        });
      }
    }
  });

export const LlmStreamEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text.delta"),
      delta: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("response.completed"),
    })
    .strict(),
]);

export const GenerationAttemptOutcomeSchema = z.enum([
  "success",
  "invalid-response",
  "provider-error",
]);

export const GenerationAttemptMetricsSchema = z
  .object({
    attempt: z.number().int().min(1).max(2),
    timeToFirstTokenMs: z.number().nonnegative().nullable(),
    durationMs: z.number().nonnegative(),
    outcome: GenerationAttemptOutcomeSchema,
  })
  .strict();

export const DialogueGenerationResultSchema = z
  .object({
    reply: CallerReplySchema,
    source: z.enum(["model", "fallback"]),
    attempts: z.array(GenerationAttemptMetricsSchema).min(1).max(2),
  })
  .strict();

export type AiIdentifier = z.infer<typeof AiIdentifierSchema>;
export type FactId = z.infer<typeof FactIdSchema>;
export type CallerEmotion = z.infer<typeof CallerEmotionSchema>;
export type CallerReplyText = z.infer<typeof CallerReplyTextSchema>;
export type EmotionIntensity = z.infer<typeof EmotionIntensitySchema>;
export type SpeechRate = z.infer<typeof SpeechRateSchema>;
export type CallerReactionAct = z.infer<typeof CallerReactionActSchema>;
export type CallerTurnPlan = z.infer<typeof CallerTurnPlanSchema>;
export type ScenarioFact = z.infer<typeof ScenarioFactSchema>;
export type DialogueTurn = z.infer<typeof DialogueTurnSchema>;
export type CallerPersona = z.infer<typeof CallerPersonaSchema>;
export type GenerationContext = z.infer<typeof GenerationContextSchema>;
export type GenerateCallerReplyRequest = z.infer<
  typeof GenerateCallerReplyRequestSchema
>;
export type CallerReply = z.infer<typeof CallerReplySchema>;
export type LlmStreamEvent = z.infer<typeof LlmStreamEventSchema>;
export type GenerationAttemptOutcome = z.infer<
  typeof GenerationAttemptOutcomeSchema
>;
export type GenerationAttemptMetrics = z.infer<
  typeof GenerationAttemptMetricsSchema
>;
export type DialogueGenerationResult = z.infer<
  typeof DialogueGenerationResultSchema
>;
