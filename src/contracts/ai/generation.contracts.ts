import { z } from "zod";

const MAX_IDENTIFIER_LENGTH = 128;
const MAX_FACT_VALUE_LENGTH = 1_000;
const MAX_OPERATOR_TEXT_LENGTH = 1_000;
export const MAX_CALLER_REPLY_LENGTH = 500;
export const MAX_RECENT_TURNS = 8;
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
  })
  .strict();

export const GenerateCallerReplyRequestSchema = z
  .object({
    requestId: AiIdentifierSchema,
    sessionId: AiIdentifierSchema,
    scenarioVersionId: AiIdentifierSchema,
    operatorText: z.string().trim().min(1).max(MAX_OPERATOR_TEXT_LENGTH),
    context: GenerationContextSchema,
  })
  .strict();

export const CallerReplySchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_CALLER_REPLY_LENGTH),
    emotion: CallerEmotionSchema,
    intensity: z.number().min(0).max(1),
    speechRate: z.number().min(0.5).max(2),
    revealedFactIds: z
      .array(FactIdSchema)
      .max(MAX_ALLOWED_FACTS)
      .refine((factIds) => uniqueBy(factIds, (factId) => factId), {
        message: "Revealed fact IDs must be unique",
      }),
    endCall: z.boolean(),
  })
  .strict();

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

export type AiIdentifier = z.infer<typeof AiIdentifierSchema>;
export type FactId = z.infer<typeof FactIdSchema>;
export type CallerEmotion = z.infer<typeof CallerEmotionSchema>;
export type ScenarioFact = z.infer<typeof ScenarioFactSchema>;
export type DialogueTurn = z.infer<typeof DialogueTurnSchema>;
export type CallerPersona = z.infer<typeof CallerPersonaSchema>;
export type GenerationContext = z.infer<typeof GenerationContextSchema>;
export type GenerateCallerReplyRequest = z.infer<
  typeof GenerateCallerReplyRequestSchema
>;
export type CallerReply = z.infer<typeof CallerReplySchema>;
export type LlmStreamEvent = z.infer<typeof LlmStreamEventSchema>;
