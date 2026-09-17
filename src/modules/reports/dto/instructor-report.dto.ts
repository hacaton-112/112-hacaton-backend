import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { ATTEMPT_STATUSES } from "@/drizzle/schema";

const IdSchema = z.uuid();
const DateTimeSchema = z.iso.datetime();

export const REPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;

const ReportPeriodQueryFields = {
  from: DateTimeSchema.optional(),
  to: DateTimeSchema.optional(),
};

const ReportQueryFields = {
  scope: z.enum(["group", "student"]),
  groupId: IdSchema.optional(),
  operatorId: IdSchema.optional(),
  ...ReportPeriodQueryFields,
};

interface ReportTargetValue {
  scope: "group" | "student";
  groupId?: string;
  operatorId?: string;
}

const validateReportTarget = (
  value: ReportTargetValue,
  context: z.RefinementCtx,
) => {
  const validGroup =
    value.scope === "group" &&
    value.groupId !== undefined &&
    value.operatorId === undefined;
  const validStudent =
    value.scope === "student" &&
    value.operatorId !== undefined &&
    value.groupId === undefined;
  if (!validGroup && !validStudent) {
    context.addIssue({
      code: "custom",
      message: "Report scope must have exactly one matching target id",
      path: ["scope"],
    });
  }
};

export const InstructorReportQuerySchema = z
  .object(ReportQueryFields)
  .strict()
  .superRefine(validateReportTarget);

export const InstructorReportExportQuerySchema = z
  .object({ ...ReportQueryFields, format: z.enum(REPORT_FORMATS) })
  .strict()
  .superRefine(validateReportTarget);

export class InstructorReportQueryDto extends createZodDto(
  InstructorReportQuerySchema,
) {}

export class InstructorReportExportQueryDto extends createZodDto(
  InstructorReportExportQuerySchema,
) {}

export const InstructorReportStatsSchema = z
  .object({
    attempts: z.number().int().nonnegative(),
    completedAttempts: z.number().int().nonnegative(),
    evaluatedAttempts: z.number().int().nonnegative(),
    passedAttempts: z.number().int().nonnegative(),
    passRate: z.number().int().min(0).max(100).nullable(),
    averageScore: z.number().int().min(0).max(100).nullable(),
    bestScore: z.number().int().min(0).max(100).nullable(),
    averageAnswerSeconds: z.number().int().nonnegative().nullable(),
    averageDurationSeconds: z.number().int().nonnegative().nullable(),
    lastAttemptAt: DateTimeSchema.nullable(),
  })
  .strict();

export const InstructorReportStudentSchema = z
  .object({
    operatorId: IdSchema,
    operatorName: z.string(),
    email: z.email().nullable(),
    serviceTags: z.array(z.string()),
    stats: InstructorReportStatsSchema,
  })
  .strict();

export const InstructorReportAttemptSchema = z
  .object({
    trainingSessionId: IdSchema,
    assignmentId: IdSchema,
    assignmentTitle: z.string(),
    groupId: IdSchema.nullable(),
    groupName: z.string().nullable(),
    operatorId: IdSchema,
    operatorName: z.string(),
    scenarioCode: z.string(),
    scenarioTitle: z.string(),
    attemptNumber: z.number().int().positive(),
    status: z.enum(ATTEMPT_STATUSES),
    offeredAt: DateTimeSchema,
    answeredAt: DateTimeSchema.nullable(),
    endedAt: DateTimeSchema.nullable(),
    answerSeconds: z.number().int().nonnegative().nullable(),
    answerNormSeconds: z.number().int().positive(),
    answeredWithinNorm: z.boolean().nullable(),
    durationSeconds: z.number().int().nonnegative().nullable(),
    expectedDurationSeconds: z.number().int().positive().nullable(),
    score: z.number().int().min(0).max(100).nullable(),
    passThreshold: z.number().int().min(0).max(100),
    passed: z.boolean().nullable(),
    analysis: z
      .object({
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
      })
      .strict(),
    grammar: z
      .object({
        status: z.literal("unavailable"),
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const InstructorReportSchema = z
  .object({
    generatedAt: DateTimeSchema,
    scope: z.enum(["group", "student"]),
    target: z
      .object({
        id: IdSchema,
        name: z.string(),
      })
      .strict(),
    period: z
      .object({
        from: DateTimeSchema.nullable(),
        to: DateTimeSchema.nullable(),
      })
      .strict(),
    stats: InstructorReportStatsSchema,
    students: z.array(InstructorReportStudentSchema),
    attempts: z.array(InstructorReportAttemptSchema),
    grammar: z
      .object({
        status: z.literal("unavailable"),
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export class InstructorReportDto extends createZodDto(InstructorReportSchema) {}

export type InstructorReportQuery = z.infer<typeof InstructorReportQuerySchema>;
export type InstructorReportExportQuery = z.infer<
  typeof InstructorReportExportQuerySchema
>;
export type InstructorReportFormat = (typeof REPORT_FORMATS)[number];
export type InstructorReport = z.infer<typeof InstructorReportSchema>;
export type InstructorReportAttempt = z.infer<
  typeof InstructorReportAttemptSchema
>;
export type InstructorReportStats = z.infer<typeof InstructorReportStatsSchema>;
export type InstructorReportStudent = z.infer<
  typeof InstructorReportStudentSchema
>;
