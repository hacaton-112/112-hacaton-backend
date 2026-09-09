import { z } from "zod";

import {
  AiIdentifierSchema,
  CallerReplySchema,
  DialogueGenerationResultSchema,
  GenerateCallerReplyRequestSchema,
} from "./generation.contracts";
import { AudioFormatSchema, AudioSampleRateSchema } from "./speech.contracts";
import { VoicePipelineMetricsSchema } from "./voice-pipeline.contracts";

const VoicePipelineEventMetadataShape = {
  eventId: AiIdentifierSchema,
  sessionId: AiIdentifierSchema,
  timestamp: z.iso.datetime(),
};

export const VoicePipelineSpeakCommandSchema = z
  .object({
    type: z.literal("speak"),
    operatorText: GenerateCallerReplyRequestSchema.shape.operatorText,
    voiceId: AiIdentifierSchema.optional(),
  })
  .strict();

export const VoicePipelineCancelCommandSchema = z
  .object({
    type: z.literal("cancel"),
  })
  .strict();

/**
 * Идентификатор учебной сессии выдаёт сервер: клиент выбирает только сценарий.
 * Иначе, зная чужой идентификатор, можно было бы подключиться к чужому звонку.
 */
export const VoicePipelineStartCommandSchema = z
  .object({
    type: z.literal("start"),
    scenarioVersionId: AiIdentifierSchema,
  })
  .strict();

export const VoicePipelineAcceptCommandSchema = z
  .object({ type: z.literal("accept") })
  .strict();

export const VoicePipelineDeclineCommandSchema = z
  .object({ type: z.literal("decline") })
  .strict();

export const VoicePipelineEndCommandSchema = z
  .object({ type: z.literal("end") })
  .strict();

export const VoicePipelineClientCommandSchema = z.discriminatedUnion("type", [
  VoicePipelineStartCommandSchema,
  VoicePipelineAcceptCommandSchema,
  VoicePipelineDeclineCommandSchema,
  VoicePipelineEndCommandSchema,
  VoicePipelineSpeakCommandSchema,
  VoicePipelineCancelCommandSchema,
]);

export const CallStageSchema = z.enum([
  "offered",
  "conversation",
  "wrap_up",
  "ended",
  "declined",
]);

/**
 * Что оператор знает о местоположении до разговора: область, а не точка.
 * Точный адрес приходит фактами по ходу звонка.
 */
export const CallLocatorSchema = z
  .object({
    centerLat: z.number().min(-90).max(90),
    centerLon: z.number().min(-180).max(180),
    radiusMeters: z.number().int().positive(),
    label: z.string().trim().min(1).max(200),
    accuracy: z.enum(["identified", "approximate", "unavailable"]),
    callerNumber: z.string().trim().min(1).max(32),
    previouslyCalled: z.boolean(),
  })
  .strict();

export const CallSnapshotShape = {
  stage: CallStageSchema,
  panicLevel: z.number().int().min(0).max(4),
  checklistTotal: z.number().int().nonnegative(),
  checklistSatisfied: z.number().int().nonnegative(),
  answerNormSeconds: z.number().int().positive(),
};

export const VoicePipelineCallOfferedEventSchema = z
  .object({
    ...VoicePipelineEventMetadataShape,
    type: z.literal("call.offered"),
    scenarioCode: z.string().trim().min(1).max(32),
    title: z.string().trim().min(1).max(120),
    locator: CallLocatorSchema.nullable(),
    ...CallSnapshotShape,
  })
  .strict();

export const VoicePipelineCallAcceptedEventSchema = z
  .object({
    ...VoicePipelineEventMetadataShape,
    type: z.literal("call.accepted"),
    /** Первая реплика задана сценарием, а не сгенерирована. */
    openingLine: z.string().trim().min(1).max(500),
    ...CallSnapshotShape,
  })
  .strict();

export const VoicePipelineCallStateEventSchema = z
  .object({
    ...VoicePipelineEventMetadataShape,
    type: z.literal("call.state"),
    revealedFactKeys: z.array(AiIdentifierSchema).max(64),
    ...CallSnapshotShape,
  })
  .strict();

export const VoicePipelineCallEndedEventSchema = z
  .object({
    ...VoicePipelineEventMetadataShape,
    type: z.literal("call.ended"),
    reason: z.enum(["operator", "declined", "scenario", "timeout"]),
    ...CallSnapshotShape,
  })
  .strict();

export const VoicePipelineReplyTextEventSchema = z
  .object({
    ...VoicePipelineEventMetadataShape,
    type: z.literal("reply.text"),
    requestId: AiIdentifierSchema,
    ...CallerReplySchema.shape,
    source: DialogueGenerationResultSchema.shape.source,
    attempts: DialogueGenerationResultSchema.shape.attempts,
    timeToReplyMs: z.number().nonnegative(),
  })
  .strict();

export const VoicePipelineAudioStartEventSchema = z
  .object({
    ...VoicePipelineEventMetadataShape,
    type: z.literal("audio.start"),
    requestId: AiIdentifierSchema,
    streamId: AiIdentifierSchema,
    sampleRate: AudioSampleRateSchema,
    channels: z.literal(1),
    format: AudioFormatSchema,
  })
  .strict();

export const VoicePipelineAudioDoneEventSchema = z
  .object({
    ...VoicePipelineEventMetadataShape,
    type: z.literal("audio.done"),
    requestId: AiIdentifierSchema,
    metrics: VoicePipelineMetricsSchema,
  })
  .strict();

export const VoicePipelineRequestCancelledEventSchema = z
  .object({
    ...VoicePipelineEventMetadataShape,
    type: z.literal("request.cancelled"),
    requestId: AiIdentifierSchema,
  })
  .strict();

export const VoicePipelineSocketErrorCodeSchema = z.enum([
  "invalid-message",
  "context-unavailable",
  "pipeline-failed",
  // Команда пришла не вовремя: например, speak до приёма вызова.
  "call-state-invalid",
]);

export const VoicePipelineSocketErrorEventSchema = z
  .object({
    ...VoicePipelineEventMetadataShape,
    type: z.literal("error"),
    requestId: AiIdentifierSchema.nullable(),
    code: VoicePipelineSocketErrorCodeSchema,
    message: z.string().trim().min(1).max(256),
  })
  .strict();

export const VoicePipelineServerEventSchema = z.discriminatedUnion("type", [
  VoicePipelineCallOfferedEventSchema,
  VoicePipelineCallAcceptedEventSchema,
  VoicePipelineCallStateEventSchema,
  VoicePipelineCallEndedEventSchema,
  VoicePipelineReplyTextEventSchema,
  VoicePipelineAudioStartEventSchema,
  VoicePipelineAudioDoneEventSchema,
  VoicePipelineRequestCancelledEventSchema,
  VoicePipelineSocketErrorEventSchema,
]);

export type VoicePipelineStartCommand = z.infer<
  typeof VoicePipelineStartCommandSchema
>;
export type VoicePipelineSpeakCommand = z.infer<
  typeof VoicePipelineSpeakCommandSchema
>;
export type CallStage = z.infer<typeof CallStageSchema>;
export type CallLocator = z.infer<typeof CallLocatorSchema>;
export type VoicePipelineCancelCommand = z.infer<
  typeof VoicePipelineCancelCommandSchema
>;
export type VoicePipelineClientCommand = z.infer<
  typeof VoicePipelineClientCommandSchema
>;
export type VoicePipelineReplyTextEvent = z.infer<
  typeof VoicePipelineReplyTextEventSchema
>;
export type VoicePipelineAudioStartEvent = z.infer<
  typeof VoicePipelineAudioStartEventSchema
>;
export type VoicePipelineAudioDoneEvent = z.infer<
  typeof VoicePipelineAudioDoneEventSchema
>;
export type VoicePipelineRequestCancelledEvent = z.infer<
  typeof VoicePipelineRequestCancelledEventSchema
>;
export type VoicePipelineSocketErrorCode = z.infer<
  typeof VoicePipelineSocketErrorCodeSchema
>;
export type VoicePipelineSocketErrorEvent = z.infer<
  typeof VoicePipelineSocketErrorEventSchema
>;
export type VoicePipelineServerEvent = z.infer<
  typeof VoicePipelineServerEventSchema
>;
