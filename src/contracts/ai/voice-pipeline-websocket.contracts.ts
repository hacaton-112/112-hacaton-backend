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

export const VoicePipelineClientCommandSchema = z.discriminatedUnion("type", [
  VoicePipelineSpeakCommandSchema,
  VoicePipelineCancelCommandSchema,
]);

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
  VoicePipelineReplyTextEventSchema,
  VoicePipelineAudioStartEventSchema,
  VoicePipelineAudioDoneEventSchema,
  VoicePipelineRequestCancelledEventSchema,
  VoicePipelineSocketErrorEventSchema,
]);

export type VoicePipelineSpeakCommand = z.infer<
  typeof VoicePipelineSpeakCommandSchema
>;
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
