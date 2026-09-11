import { z } from "zod";

import { CallStageSchema } from "./call";
import { IncidentCardSchema } from "./incident";

export const CallSummarySchema = z.object({
  trainingSessionId: z.string(),
  scenarioCode: z.string(),
  title: z.string(),
  stage: CallStageSchema,
  offeredAt: z.iso.datetime(),
  answeredAt: z.iso.datetime().nullable(),
  endedAt: z.iso.datetime().nullable(),
  /** Длительность разговора, а не ожидания: считается от приёма вызова. */
  durationSeconds: z.number().int().nullable(),
});

/**
 * Событие журнала. Полезная нагрузка приходит как есть: окно рисует по типу,
 * а знать про каждый тип больше, чем знает журнал, ему незачем.
 */
export const TimelineEntrySchema = z.object({
  sequence: z.number().int(),
  at: z.iso.datetime(),
  /** Смещение от приёма вызова — тот же ноль, что у кусков записи. */
  offsetMs: z.number().int().nullable(),
  type: z.string(),
  actor: z.string(),
  details: z.record(z.string(), z.unknown()),
});

export const DebriefFactSchema = z.object({
  key: z.string(),
  label: z.string(),
  severity: z.enum(["normal", "heavy"]),
  revealed: z.boolean(),
  revealedAt: z.iso.datetime().nullable(),
});

export const DebriefQuestionSchema = z.object({
  text: z.string(),
  isCritical: z.boolean(),
  satisfied: z.boolean(),
  satisfiedByFactKeys: z.array(z.string()),
});

export const DebriefRecordingSegmentSchema = z.object({
  track: z.enum(["operator", "caller"]),
  startMs: z.number().int(),
  durationMs: z.number().int(),
  sampleRate: z.number().int(),
  url: z.string(),
});

export const DebriefSchema = z.object({
  call: CallSummarySchema,
  timings: z.object({
    answerSeconds: z.number().int().nullable(),
    answerNormSeconds: z.number().int(),
    durationSeconds: z.number().int().nullable(),
  }),
  finalPanicLevel: z.number().int(),
  timeline: z.array(TimelineEntrySchema),
  facts: z.array(DebriefFactSchema),
  questions: z.array(DebriefQuestionSchema),
  incidentCard: IncidentCardSchema.nullable(),
  recording: z.array(DebriefRecordingSegmentSchema),
});

export const CallListSchema = z.object({ calls: z.array(CallSummarySchema) });

export type CallSummary = z.infer<typeof CallSummarySchema>;
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;
export type DebriefFact = z.infer<typeof DebriefFactSchema>;
export type DebriefQuestion = z.infer<typeof DebriefQuestionSchema>;
export type DebriefRecordingSegment = z.infer<
  typeof DebriefRecordingSegmentSchema
>;
export type Debrief = z.infer<typeof DebriefSchema>;
