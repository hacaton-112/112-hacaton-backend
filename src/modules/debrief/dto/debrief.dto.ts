import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { CALL_STAGES, FACT_SEVERITIES } from "@/drizzle/schema";
import { IncidentCardSchema } from "@/modules/incident-card/dto/incident-card.dto";

/** Строка в списке своих звонков: столько, сколько нужно, чтобы выбрать один. */
export const CallSummarySchema = z
  .object({
    trainingSessionId: z.string().min(1),
    scenarioCode: z.string(),
    title: z.string(),
    stage: z.enum(CALL_STAGES),
    offeredAt: z.iso.datetime(),
    answeredAt: z.iso.datetime().nullable(),
    endedAt: z.iso.datetime().nullable(),
    /** Длительность разговора, а не ожидания: считается от приёма вызова. */
    durationSeconds: z.number().int().nullable(),
  })
  .strict();

/**
 * Событие журнала, каким его видит разбор.
 *
 * Полезная нагрузка отдаётся как есть: разбор не обязан знать про каждый тип
 * события больше, чем знает журнал, а клиент рисует по типу. Единственное
 * добавление — подписи фактов, потому что ключ вроде `trapped_children`
 * человеку ничего не говорит.
 */
export const TimelineEntrySchema = z
  .object({
    sequence: z.number().int(),
    at: z.iso.datetime(),
    /** Смещение от приёма вызова: по нему запись прыгает в нужное место. */
    offsetMs: z.number().int().nullable(),
    type: z.string(),
    actor: z.string(),
    details: z.record(z.string(), z.unknown()),
  })
  .strict();

/** Сведение сценария: получил его оператор или нет. */
export const DebriefFactSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    severity: z.enum(FACT_SEVERITIES),
    revealed: z.boolean(),
    revealedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const DebriefQuestionSchema = z
  .object({
    text: z.string(),
    isCritical: z.boolean(),
    satisfied: z.boolean(),
    satisfiedByFactKeys: z.array(z.string()),
  })
  .strict();

export const DebriefRecordingSegmentSchema = z
  .object({
    track: z.enum(["operator", "caller"]),
    startMs: z.number().int(),
    durationMs: z.number().int(),
    sampleRate: z.number().int(),
    /** Адрес у backend: корзина закрыта, ключей у клиента нет. */
    url: z.string(),
  })
  .strict();

export const DebriefSkillSchema = z
  .object({
    key: z.enum(["questioning", "card", "services", "regulations"]),
    label: z.string(),
    percent: z.number().int().min(0).max(100),
    /** Из чего сложился процент: строка под полосой на разборе. */
    detail: z.string(),
  })
  .strict();

export const DebriefFieldSchema = z
  .object({
    field: z.string(),
    expected: z.string(),
    actual: z.string().nullable(),
    matched: z.boolean(),
    isRequired: z.boolean(),
  })
  .strict();

export const DebriefEvaluationSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    verdict: z.enum(["excellent", "passed", "failed"]),
    passThreshold: z.number().int().min(0).max(100),
    difficulty: z.number().int().min(1).max(5),
    skills: z.array(DebriefSkillSchema),
    /** Сравнение карточки с эталонной анкетой, поле за полем. */
    fields: z.array(DebriefFieldSchema),
    recommendations: z.array(z.string()),
    /** Среднее по другим операторам; `null`, пока сравнивать не с кем. */
    groupAverageScore: z.number().int().min(0).max(100).nullable(),
    groupCalls: z.number().int().min(0),
  })
  .strict();

export const DebriefSchema = z
  .object({
    call: CallSummarySchema,
    timings: z
      .object({
        /** Сколько оператор шёл к трубке и сколько ему давал сценарий. */
        answerSeconds: z.number().int().nullable(),
        answerNormSeconds: z.number().int(),
        durationSeconds: z.number().int().nullable(),
        /** Сколько на такой вызов отводит сценарий. */
        expectedDurationSeconds: z.number().int(),
      })
      .strict(),
    finalPanicLevel: z.number().int().min(0).max(4),
    timeline: z.array(TimelineEntrySchema),
    facts: z.array(DebriefFactSchema),
    questions: z.array(DebriefQuestionSchema),
    incidentCard: IncidentCardSchema.nullable(),
    recording: z.array(DebriefRecordingSegmentSchema),
    /** Запись целиком; `null`, когда в звонке не прозвучало ни слова. */
    recordingUrl: z.string().nullable(),
    /** Оценка; `null`, пока звонок не закончен и оценивать нечего. */
    evaluation: DebriefEvaluationSchema.nullable(),
  })
  .strict();

export const CallListSchema = z
  .object({ calls: z.array(CallSummarySchema) })
  .strict();

export class CallListDto extends createZodDto(CallListSchema) {}
export class DebriefDto extends createZodDto(DebriefSchema) {}

export type CallList = z.infer<typeof CallListSchema>;
export type CallSummary = z.infer<typeof CallSummarySchema>;
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;
export type DebriefFact = z.infer<typeof DebriefFactSchema>;
export type DebriefQuestion = z.infer<typeof DebriefQuestionSchema>;
export type DebriefRecordingSegment = z.infer<
  typeof DebriefRecordingSegmentSchema
>;
export type Debrief = z.infer<typeof DebriefSchema>;
export type DebriefEvaluation = z.infer<typeof DebriefEvaluationSchema>;
