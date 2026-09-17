import { z } from "zod";

import { TrainingAttemptStatusSchema } from "./training";

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
