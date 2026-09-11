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

export const DebriefSkillSchema = z.object({
  key: z.enum(["questioning", "card", "services", "regulations"]),
  label: z.string(),
  percent: z.number().int(),
  /** Из чего сложился процент: строка под полосой. */
  detail: z.string(),
});

export const DebriefFieldSchema = z.object({
  field: z.string(),
  expected: z.string(),
  actual: z.string().nullable(),
  matched: z.boolean(),
  isRequired: z.boolean(),
});

export const DebriefEvaluationSchema = z.object({
  score: z.number().int(),
  verdict: z.enum(["excellent", "passed", "failed"]),
  passThreshold: z.number().int(),
  difficulty: z.number().int(),
  skills: z.array(DebriefSkillSchema),
  fields: z.array(DebriefFieldSchema),
  recommendations: z.array(z.string()),
  /** Среднее по другим операторам; `null`, пока сравнивать не с кем. */
  groupAverageScore: z.number().int().nullable(),
  groupCalls: z.number().int(),
});

export const DebriefSchema = z.object({
  call: CallSummarySchema,
  timings: z.object({
    answerSeconds: z.number().int().nullable(),
    answerNormSeconds: z.number().int(),
    durationSeconds: z.number().int().nullable(),
    expectedDurationSeconds: z.number().int(),
  }),
  finalPanicLevel: z.number().int(),
  timeline: z.array(TimelineEntrySchema),
  facts: z.array(DebriefFactSchema),
  questions: z.array(DebriefQuestionSchema),
  incidentCard: IncidentCardSchema.nullable(),
  evaluation: DebriefEvaluationSchema.nullable(),
  recording: z.array(DebriefRecordingSegmentSchema),
  /** Разговор одной дорожкой; `null`, когда записывать было нечего. */
  recordingUrl: z.string().nullable(),
});

export const CallListSchema = z.object({ calls: z.array(CallSummarySchema) });

export type CallSummary = z.infer<typeof CallSummarySchema>;
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;
export type DebriefFact = z.infer<typeof DebriefFactSchema>;
export type DebriefQuestion = z.infer<typeof DebriefQuestionSchema>;
export type DebriefEvaluation = z.infer<typeof DebriefEvaluationSchema>;
export type DebriefSkill = z.infer<typeof DebriefSkillSchema>;
export type DebriefField = z.infer<typeof DebriefFieldSchema>;
export type DebriefRecordingSegment = z.infer<
  typeof DebriefRecordingSegmentSchema
>;
export type Debrief = z.infer<typeof DebriefSchema>;
