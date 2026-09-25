import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { GrammarReportSchema } from "@/contracts";

import { DDS_PROCESS_ERROR_TYPES } from "../domain/dds-report-aggregation";

const Id = z.uuid();
const DateTime = z.iso.datetime();

export const DdsReportInsightsSchema = z.object({
  status: z.enum(["pending", "processing", "done", "failed"]),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
  focusScenarios: z.array(z.string()),
  error: z.string().nullable(),
});

export const DdsReportCardSchema = z.object({
  exerciseId: Id,
  operatorId: Id,
  operatorName: z.string(),
  scenarioVersionId: Id,
  scenarioCode: z.string(),
  scenarioTitle: z.string(),
  finalStatus: z.string(),
  expectedOutcome: z.enum(["accept", "refuse"]).nullable(),
  outcomeMatched: z.boolean().nullable(),
  timeline: z.array(
    z.object({
      sequence: z.number().int().positive(),
      status: z.string(),
      comment: z.string().nullable(),
      occurredAt: DateTime,
      elapsedSeconds: z.number().int().nonnegative(),
    }),
  ),
  timing: z.object({
    reactionSeconds: z.number().int().nonnegative().nullable(),
    reactionNormSeconds: z.number().int().positive(),
    reactionWithinNorm: z.boolean().nullable(),
    completionSeconds: z.number().int().nonnegative().nullable(),
    completionNormSeconds: z.number().int().positive(),
    completionWithinNorm: z.boolean().nullable(),
  }),
  processErrors: z.array(z.enum(DDS_PROCESS_ERROR_TYPES)),
  coverage: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      status: z.enum(["present", "missing"]),
      quote: z.string().nullable(),
    }),
  ),
  contradictions: z.array(
    z.object({ description: z.string(), quote: z.string() }),
  ),
  grammar: GrammarReportSchema.nullable(),
  automaticScore: z.number().int().min(0).max(100).nullable(),
  instructorReview: z
    .object({ score: z.number().int().min(0).max(100), comment: z.string() })
    .nullable(),
  finalScore: z.number().int().min(0).max(100).nullable(),
});

export const DdsLessonReportSchema = z.object({
  lesson: z.object({
    id: Id,
    title: z.string(),
    status: z.enum(["active", "finished"]),
    startedAt: DateTime,
    finishedAt: DateTime.nullable(),
    acknowledgementNormSeconds: z.number().int().positive(),
    passThreshold: z.number().int(),
  }),
  summary: z.object({
    cards: z.number().int().nonnegative(),
    averageScore: z.number().int().nullable(),
    minScore: z.number().int().nullable(),
    maxScore: z.number().int().nullable(),
    withinNormPercent: z.number().int().nullable(),
    topErrors: z.array(
      z.object({
        type: z.enum(DDS_PROCESS_ERROR_TYPES),
        count: z.number().int(),
      }),
    ),
    outcomes: z.array(
      z.object({ status: z.string(), count: z.number().int() }),
    ),
  }),
  students: z.array(
    z.object({
      operatorId: Id,
      operatorName: z.string(),
      cards: z.number().int(),
      averageScore: z.number().int().nullable(),
      minScore: z.number().int().nullable(),
      maxScore: z.number().int().nullable(),
    }),
  ),
  cards: z.array(DdsReportCardSchema),
  insights: DdsReportInsightsSchema.nullable(),
});

export const DdsMyResultsSchema = z.object({
  lessons: z.array(
    z.object({
      lessonId: Id,
      title: z.string(),
      status: z.enum(["active", "finished"]),
      startedAt: DateTime,
      finishedAt: DateTime.nullable(),
      cards: z.number().int().nonnegative(),
      averageScore: z.number().int().nullable(),
      attempts: z.array(
        z.object({
          exerciseId: Id,
          scenarioCode: z.string(),
          scenarioTitle: z.string(),
          finalStatus: z.string(),
          finalScore: z.number().int().min(0).max(100).nullable(),
        }),
      ),
    }),
  ),
});

export const DdsMyResultSchema = z.object({
  lesson: DdsLessonReportSchema.shape.lesson,
  card: DdsReportCardSchema,
});

export const DdsReportExportQuerySchema = z.object({
  format: z.enum(["pdf", "xlsx", "csv"]),
});

export class DdsLessonReportDto extends createZodDto(DdsLessonReportSchema) {}
export class DdsMyResultsDto extends createZodDto(DdsMyResultsSchema) {}
export class DdsMyResultDto extends createZodDto(DdsMyResultSchema) {}
export class DdsReportExportQueryDto extends createZodDto(
  DdsReportExportQuerySchema,
) {}

export type DdsLessonReport = z.infer<typeof DdsLessonReportSchema>;
export type DdsReportCard = z.infer<typeof DdsReportCardSchema>;
