import { z } from "zod";

import { CREW_CALL_OUTCOMES } from "@/drizzle/schema";

const EventIdSchema = z.uuid();
const ExerciseIdSchema = z.uuid();
const PromptIdSchema = z.uuid();

/** Команды отдельного браузерного телефона ДДС. */
export const DirectCrewCallClientCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("start"),
      eventId: EventIdSchema,
      exerciseId: ExerciseIdSchema,
      dialedNumber: z.string().regex(/^\d{1,12}$/u),
    })
    .strict(),
  z
    .object({
      type: z.literal("prompt.played"),
      eventId: EventIdSchema,
      promptId: PromptIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("end"),
      eventId: EventIdSchema,
    })
    .strict(),
]);

const ServerEventMetadataSchema = z.object({
  eventId: EventIdSchema,
  sessionId: z.string().min(1),
  timestamp: z.iso.datetime(),
});

/**
 * Метаданные PCM передаются до бинарных кадров. Клиент подтверждает окончание
 * фактического воспроизведения отдельной командой `prompt.played`.
 */
export const DirectCrewCallServerEventSchema = z.discriminatedUnion("type", [
  ServerEventMetadataSchema.extend({ type: z.literal("socket.ready") }).strict(),
  ServerEventMetadataSchema.extend({
    type: z.literal("call.connected"),
    dialedNumber: z.string().min(1),
    callsign: z.string().min(1).nullable(),
    purpose: z.enum(["handoff", "progress_check"]),
  }).strict(),
  ServerEventMetadataSchema.extend({
    type: z.literal("listen.started"),
  }).strict(),
  ServerEventMetadataSchema.extend({
    type: z.literal("listen.stopped"),
  }).strict(),
  ServerEventMetadataSchema.extend({
    type: z.literal("transcript"),
    text: z.string().min(1),
    complete: z.boolean(),
    missingFields: z.array(
      z.enum(["address", "incident", "description", "victims"]),
    ),
  }).strict(),
  ServerEventMetadataSchema.extend({
    type: z.literal("audio.start"),
    promptId: PromptIdSchema,
    text: z.string().min(1),
    sampleRate: z.number().int().min(8_000).max(192_000),
  }).strict(),
  ServerEventMetadataSchema.extend({
    type: z.literal("audio.done"),
    promptId: PromptIdSchema,
  }).strict(),
  ServerEventMetadataSchema.extend({
    type: z.literal("call.ended"),
    outcome: z.enum(CREW_CALL_OUTCOMES),
  }).strict(),
  ServerEventMetadataSchema.extend({
    type: z.literal("error"),
    code: z.enum([
      "invalid-command",
      "call-already-started",
      "call-not-started",
      "call-failed",
    ]),
    message: z.string().min(1),
  }).strict(),
]);

export type DirectCrewCallClientCommand = z.infer<
  typeof DirectCrewCallClientCommandSchema
>;
export type DirectCrewCallServerEvent = z.infer<
  typeof DirectCrewCallServerEventSchema
>;
type WithoutServerMetadata<T> = T extends unknown
  ? Omit<T, "eventId" | "sessionId" | "timestamp">
  : never;
export type DirectCrewCallServerEventInput =
  WithoutServerMetadata<DirectCrewCallServerEvent>;
