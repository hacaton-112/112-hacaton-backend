import { z } from "zod";

import { TrainingAttemptStatusSchema } from "./training";
import { DDS_PROCESS_ERROR_TYPES } from "./dds-report";

export const ReportScopeSchema = z.enum(["group", "student"]);
export const ReportFormatSchema = z.enum(["csv", "xlsx", "pdf"]);

export const InstructorReportStatsSchema = z.object({
  attempts: z.number().int().nonnegative(),
  completedAttempts: z.number().int().nonnegative(),
  evaluatedAttempts: z.number().int().nonnegative(),
  passedAttempts: z.number().int().nonnegative(),
  passRate: z.number().int().min(0).max(100).nullable(),
  averageScore: z.number().int().min(0).max(100).nullable(),
  bestScore: z.number().int().min(0).max(100).nullable(),
  averageAnswerSeconds: z.number().int().nonnegative().nullable(),
  averageDurationSeconds: z.number().int().nonnegative().nullable(),
  lastAttemptAt: z.iso.datetime().nullable(),
});

export const InstructorReportStudentSchema = z.object({
  operatorId: z.uuid(),
  operatorName: z.string(),
  email: z.email().nullable(),
  serviceTags: z.array(z.string()),
  stats: InstructorReportStatsSchema,
});

export const InstructorReportAttemptSchema = z.object({
  trainingSessionId: z.uuid(),
  assignmentId: z.uuid(),
  assignmentTitle: z.string(),
  groupId: z.uuid().nullable(),
  groupName: z.string().nullable(),
  operatorId: z.uuid(),
  operatorName: z.string(),
  scenarioCode: z.string(),
  scenarioTitle: z.string(),
  attemptNumber: z.number().int().positive(),
  status: TrainingAttemptStatusSchema,
  offeredAt: z.iso.datetime(),
  answeredAt: z.iso.datetime().nullable(),
  endedAt: z.iso.datetime().nullable(),
  answerSeconds: z.number().int().nonnegative().nullable(),
  answerNormSeconds: z.number().int().positive(),
  answeredWithinNorm: z.boolean().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  expectedDurationSeconds: z.number().int().positive().nullable(),
  score: z.number().int().min(0).max(100).nullable(),
  passThreshold: z.number().int().min(0).max(100),
  passed: z.boolean().nullable(),
  analysis: z.object({
    status: z.enum(["ready", "pending", "unavailable"]),
    timelineEvents: z.number().int().nonnegative().nullable(),
    questionsSatisfied: z.number().int().nonnegative().nullable(),
    questionsTotal: z.number().int().nonnegative().nullable(),
    factsRevealed: z.number().int().nonnegative().nullable(),
    factsTotal: z.number().int().nonnegative().nullable(),
    criticalQuestionsMissed: z.number().int().nonnegative().nullable(),
    requiredFieldsMissing: z.number().int().nonnegative().nullable(),
    incorrectFields: z.number().int().nonnegative().nullable(),
    incidentCardCompleted: z.boolean().nullable(),
    fields: z
      .array(
        z.object({
          field: z.string(),
          matched: z.boolean(),
          isRequired: z.boolean(),
        }),
      )
      .default([]),
    recommendations: z.array(z.string()),
  }),
  grammar: z.object({
    status: z.literal("unavailable"),
    message: z.string(),
  }),
});

export const InstructorReportSchema = z.object({
  generatedAt: z.iso.datetime(),
  scope: ReportScopeSchema,
  target: z.object({ id: z.uuid(), name: z.string() }),
  period: z.object({
    from: z.iso.datetime().nullable(),
    to: z.iso.datetime().nullable(),
  }),
  stats: InstructorReportStatsSchema,
  students: z.array(InstructorReportStudentSchema),
  attempts: z.array(InstructorReportAttemptSchema),
  grammar: z.object({
    status: z.literal("unavailable"),
    message: z.string(),
  }),
  dds: z
    .object({
      cards: z.number().int().nonnegative(),
      averageScore: z.number().int().nullable(),
      finalScore: z.number().int().nullable(),
      withinNormPercent: z.number().int().nullable(),
      outcomes: z.array(
        z.object({ status: z.string(), count: z.number().int() }),
      ),
      topErrors: z.array(
        z.object({
          type: z.enum(DDS_PROCESS_ERROR_TYPES),
          count: z.number().int(),
        }),
      ),
      averageCoveragePercent: z.number().int().nullable(),
      scoreDynamics: z.array(
        z.object({
          lessonId: z.uuid(),
          title: z.string(),
          occurredAt: z.iso.datetime(),
          score: z.number().int().nullable(),
        }),
      ),
      weakPoints: z.array(
        z.object({ label: z.string(), count: z.number().int() }),
      ),
      recentAttempts: z.array(
        z.object({
          exerciseId: z.uuid(),
          lessonTitle: z.string().nullable(),
          occurredAt: z.iso.datetime(),
          finalStatus: z.string(),
          finalScore: z.number().int().nullable(),
        }),
      ),
    })
    .default({
      cards: 0,
      averageScore: null,
      finalScore: null,
      withinNormPercent: null,
      outcomes: [],
      topErrors: [],
      averageCoveragePercent: null,
      scoreDynamics: [],
      weakPoints: [],
      recentAttempts: [],
    }),
  analytics: z
    .object({
      cardFields: z.array(
        z.object({
          field: z.string(),
          label: z.string(),
          correct: z.number().int().nonnegative(),
          missed: z.number().int().nonnegative(),
          correctedAfterHint: z.number().int().nonnegative(),
          total: z.number().int().positive(),
          correctRate: z.number().int().min(0).max(100),
        }),
      ),
      ddsReferenceItems: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          missing: z.number().int().nonnegative(),
          present: z.number().int().nonnegative(),
          total: z.number().int().positive(),
          missRate: z.number().int().min(0).max(100),
        }),
      ),
      processErrors: z.array(
        z.object({
          type: z.string(),
          total: z.number().int().positive(),
          students: z.array(
            z.object({
              operatorId: z.uuid(),
              operatorName: z.string(),
              count: z.number().int().positive(),
            }),
          ),
        }),
      ),
      dynamics: z.object({
        voice: z.array(
          z.object({
            key: z.string(),
            label: z.string(),
            occurredAt: z.iso.datetime(),
            averageScore: z.number().int(),
            attempts: z.number().int().positive(),
          }),
        ),
        dds: z.array(
          z.object({
            key: z.string(),
            label: z.string(),
            occurredAt: z.iso.datetime(),
            averageScore: z.number().int(),
            attempts: z.number().int().positive(),
          }),
        ),
      }),
      heatmap: z.object({
        fields: z.array(z.object({ field: z.string(), label: z.string() })),
        rows: z.array(
          z.object({
            operatorId: z.uuid(),
            operatorName: z.string(),
            values: z.array(z.number().int().min(0).max(100).nullable()),
          }),
        ),
      }),
    })
    .nullable()
    .default(null),
});

export const ReadinessPredictionSchema = z.object({
  probability: z.number().min(0).max(1),
  label: z.enum(["ready", "needs_training", "insufficient"]),
  blockers: z.array(z.string()).min(1).max(3),
  features: z.object({
    averageScore: z.number().nullable(),
    latestScore: z.number().nullable(),
    trend: z.number(),
    passRate: z.number().nullable(),
    withinNormRate: z.number().nullable(),
    processErrorFrequency: z.number(),
    textCoverage: z.number().nullable(),
    attempts: z.number().int().nonnegative(),
  }),
  quality: z.object({
    status: z.enum(["measured", "insufficient"]),
    accuracy: z.number().min(0).max(1).nullable(),
    observations: z.number().int().nonnegative(),
    trainingObservations: z.number().int().nonnegative(),
    testObservations: z.number().int().nonnegative(),
  }),
});

export const InstructorReadinessSchema = z.object({
  generatedAt: z.iso.datetime(),
  scope: ReportScopeSchema,
  target: z.object({ id: z.uuid(), name: z.string() }),
  prediction: ReadinessPredictionSchema,
  students: z.array(
    z.object({
      operatorId: z.uuid(),
      operatorName: z.string(),
      prediction: ReadinessPredictionSchema,
    }),
  ),
});

export type ReportScope = z.infer<typeof ReportScopeSchema>;
export type ReportFormat = z.infer<typeof ReportFormatSchema>;
export type InstructorReport = z.infer<typeof InstructorReportSchema>;
export type InstructorReportStudent = z.infer<
  typeof InstructorReportStudentSchema
>;
export type InstructorReportAttempt = z.infer<
  typeof InstructorReportAttemptSchema
>;
export type InstructorReadiness = z.infer<typeof InstructorReadinessSchema>;
export type ReadinessPrediction = z.infer<typeof ReadinessPredictionSchema>;

export type InstructorReportFilters =
  | {
      scope: "group";
      groupId: string;
      from?: string;
      to?: string;
    }
  | {
      scope: "student";
      operatorId: string;
      from?: string;
      to?: string;
    };

export type InstructorReadinessFilters =
  | { scope: "group"; groupId: string }
  | { scope: "student"; operatorId: string };
