import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TYPES,
  ATTEMPT_STATUSES,
  CARD_SOURCES,
  CALL_STAGES,
  GROUP_STATUSES,
  SCENARIO_CATEGORIES,
} from "@/drizzle/schema";
import { MethodicalMaterialSchema } from "@/modules/methodical-materials/dto/methodical-materials.dto";

const IdSchema = z.uuid();
const DateTimeSchema = z.iso.datetime();

export const CreateTrainingGroupSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    code: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((value) => value.toUpperCase()),
    organization: z.string().trim().min(2).max(160),
    instructorId: IdSchema.optional(),
  })
  .strict();

export class CreateTrainingGroupDto extends createZodDto(
  CreateTrainingGroupSchema,
) {}

export const UpdateTrainingGroupSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    code: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((value) => value.toUpperCase())
      .optional(),
    /** Передать группу другому преподавателю может только администратор. */
    instructorId: IdSchema.optional(),
    organization: z.string().trim().min(2).max(160).optional(),
    status: z.enum(GROUP_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one group field is required",
  });

export class UpdateTrainingGroupDto extends createZodDto(
  UpdateTrainingGroupSchema,
) {}

export const AddTrainingGroupMemberSchema = z
  .object({
    userId: IdSchema,
    serviceTag: z.string().trim().min(2).max(64),
  })
  .strict();

export class AddTrainingGroupMemberDto extends createZodDto(
  AddTrainingGroupMemberSchema,
) {}

/** Служба ученика в группе меняется без исключения из неё. */
export const UpdateTrainingGroupMemberSchema = z
  .object({ serviceTag: z.string().trim().min(2).max(64) })
  .strict();

export class UpdateTrainingGroupMemberDto extends createZodDto(
  UpdateTrainingGroupMemberSchema,
) {}

export const TrainingGroupMemberSchema = z
  .object({
    userId: IdSchema,
    fullName: z.string(),
    email: z.email(),
    serviceTag: z.string(),
    joinedAt: DateTimeSchema,
  })
  .strict();

export const TrainingGroupSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    code: z.string(),
    organization: z.string(),
    instructorId: IdSchema,
    status: z.enum(GROUP_STATUSES),
    members: z.array(TrainingGroupMemberSchema),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  })
  .strict();

export const TrainingGroupListSchema = z
  .object({ groups: z.array(TrainingGroupSchema) })
  .strict();

export class TrainingGroupDto extends createZodDto(TrainingGroupSchema) {}
export class TrainingGroupListDto extends createZodDto(
  TrainingGroupListSchema,
) {}

export const OperatorOptionSchema = z
  .object({ id: IdSchema, fullName: z.string(), email: z.email() })
  .strict();
export const OperatorOptionListSchema = z
  .object({ operators: z.array(OperatorOptionSchema) })
  .strict();
export class OperatorOptionListDto extends createZodDto(
  OperatorOptionListSchema,
) {}

export const CreateTrainingAssignmentSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    scenarioVersionId: IdSchema,
    groupId: IdSchema.optional(),
    targetUserId: IdSchema.optional(),
    type: z.enum(ASSIGNMENT_TYPES).default("voice_call"),
    cardSource: z.enum(CARD_SOURCES).default("generated"),
    serviceTag: z.string().trim().min(2).max(64).nullable().default(null),
    answerNormSeconds: z.number().int().min(1).max(86_400).default(240),
    passThreshold: z.number().int().min(50).max(100).default(75),
    maxAttempts: z.number().int().min(1).max(100).nullable().default(3),
    dueDate: DateTimeSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      Number(value.groupId !== undefined) +
        Number(value.targetUserId !== undefined) ===
      1,
    { message: "Exactly one assignment target is required" },
  );

export class CreateTrainingAssignmentDto extends createZodDto(
  CreateTrainingAssignmentSchema,
) {}

export const TrainingAssignmentSchema = z
  .object({
    id: IdSchema,
    title: z.string(),
    scenarioVersionId: IdSchema,
    scenarioCode: z.string(),
    scenarioTitle: z.string(),
    category: z.enum(SCENARIO_CATEGORIES),
    difficulty: z.number().int(),
    groupId: IdSchema.nullable(),
    groupName: z.string().nullable(),
    targetUserId: IdSchema.nullable(),
    type: z.enum(ASSIGNMENT_TYPES),
    cardSource: z.enum(CARD_SOURCES),
    serviceTag: z.string().nullable(),
    answerNormSeconds: z.number().int(),
    passThreshold: z.number().int(),
    maxAttempts: z.number().int().nullable(),
    dueDate: DateTimeSchema.nullable(),
    status: z.enum(ASSIGNMENT_STATUSES),
    usedAttempts: z.number().int().nonnegative(),
    launchedAt: DateTimeSchema.nullable(),
    completedAt: DateTimeSchema.nullable(),
    createdAt: DateTimeSchema,
  })
  .strict();

export const TrainingAssignmentListSchema = z
  .object({ assignments: z.array(TrainingAssignmentSchema) })
  .strict();
export class TrainingAssignmentDto extends createZodDto(
  TrainingAssignmentSchema,
) {}
export class TrainingAssignmentListDto extends createZodDto(
  TrainingAssignmentListSchema,
) {}

export const UpdateTrainingAssignmentSchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    answerNormSeconds: z.number().int().min(1).max(86_400).optional(),
    passThreshold: z.number().int().min(50).max(100).optional(),
    maxAttempts: z.number().int().min(1).max(100).nullable().optional(),
    dueDate: DateTimeSchema.nullable().optional(),
    cardSource: z.enum(CARD_SOURCES).optional(),
    serviceTag: z.string().trim().min(2).max(64).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one assignment field is required",
  });
export class UpdateTrainingAssignmentDto extends createZodDto(
  UpdateTrainingAssignmentSchema,
) {}

export const EndTrainingSessionSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export class EndTrainingSessionDto extends createZodDto(
  EndTrainingSessionSchema,
) {}

export const LiveTrainingSessionSchema = z
  .object({
    trainingSessionId: IdSchema,
    assignmentId: IdSchema,
    assignmentTitle: z.string(),
    groupId: IdSchema.nullable(),
    groupName: z.string().nullable(),
    scenarioCode: z.string(),
    scenarioTitle: z.string(),
    operatorId: IdSchema,
    operatorName: z.string(),
    stage: z.enum(CALL_STAGES),
    attemptStatus: z.enum(ATTEMPT_STATUSES),
    panicLevel: z.number().int(),
    checklistSatisfied: z.number().int(),
    checklistTotal: z.number().int(),
    elapsedSeconds: z.number().int().nonnegative(),
    startedAt: DateTimeSchema,
  })
  .strict();
export const LiveTrainingSessionListSchema = z
  .object({ sessions: z.array(LiveTrainingSessionSchema) })
  .strict();
export class LiveTrainingSessionListDto extends createZodDto(
  LiveTrainingSessionListSchema,
) {}

export const InstructorCallSchema = z
  .object({
    trainingSessionId: IdSchema,
    assignmentId: IdSchema,
    assignmentTitle: z.string(),
    groupId: IdSchema.nullable(),
    groupName: z.string().nullable(),
    operatorId: IdSchema,
    operatorName: z.string(),
    scenarioCode: z.string(),
    title: z.string(),
    stage: z.enum(CALL_STAGES),
    offeredAt: DateTimeSchema,
    answeredAt: DateTimeSchema.nullable(),
    endedAt: DateTimeSchema.nullable(),
    durationSeconds: z.number().int().nullable(),
    attemptNumber: z.number().int().positive(),
    attemptStatus: z.enum(ATTEMPT_STATUSES),
    passThreshold: z.number().int(),
    score: z.number().int().nullable(),
  })
  .strict();
export const InstructorCallListSchema = z
  .object({ calls: z.array(InstructorCallSchema) })
  .strict();
export class InstructorCallListDto extends createZodDto(
  InstructorCallListSchema,
) {}

export const StudentStatsSchema = z
  .object({
    attempts: z.number().int().nonnegative(),
    completedAttempts: z.number().int().nonnegative(),
    evaluatedCalls: z.number().int().nonnegative(),
    passedCalls: z.number().int().nonnegative(),
    averageScore: z.number().int().nullable(),
    bestScore: z.number().int().nullable(),
    averageAnswerSeconds: z.number().int().nullable(),
    lastAttemptAt: DateTimeSchema.nullable(),
  })
  .strict();

export const GroupStudentSchema = TrainingGroupMemberSchema.extend({
  stats: StudentStatsSchema,
}).strict();
export const GroupStudentListSchema = z
  .object({ students: z.array(GroupStudentSchema) })
  .strict();
export class GroupStudentListDto extends createZodDto(GroupStudentListSchema) {}

export const StudentSchema = z
  .object({
    id: IdSchema,
    fullName: z.string(),
    email: z.email(),
    groups: z.array(
      z
        .object({
          groupId: IdSchema,
          groupName: z.string(),
          serviceTag: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const StudentListItemSchema = StudentSchema.extend({
  stats: StudentStatsSchema,
}).strict();
export const StudentListSchema = z
  .object({ students: z.array(StudentListItemSchema) })
  .strict();
export class StudentListDto extends createZodDto(StudentListSchema) {}

/** Страница ученика: кто он, как учится и какие разборы у него есть. */
export const StudentProfileSchema = z
  .object({
    student: StudentSchema,
    stats: StudentStatsSchema,
    calls: z.array(InstructorCallSchema),
    methodicalMaterials: z.array(MethodicalMaterialSchema).optional(),
  })
  .strict();
export class StudentProfileDto extends createZodDto(StudentProfileSchema) {}

export const EndTrainingSessionResponseSchema = z
  .object({
    trainingSessionId: IdSchema,
    status: z.literal("cancelled_by_instructor"),
    endedAt: DateTimeSchema,
  })
  .strict();
export class EndTrainingSessionResponseDto extends createZodDto(
  EndTrainingSessionResponseSchema,
) {}

export type CreateTrainingGroup = z.infer<typeof CreateTrainingGroupSchema>;
export type UpdateTrainingGroup = z.infer<typeof UpdateTrainingGroupSchema>;
export type UpdateTrainingAssignment = z.infer<
  typeof UpdateTrainingAssignmentSchema
>;
export type UpdateTrainingGroupMember = z.infer<
  typeof UpdateTrainingGroupMemberSchema
>;
export type AddTrainingGroupMember = z.infer<
  typeof AddTrainingGroupMemberSchema
>;
export type CreateTrainingAssignment = z.infer<
  typeof CreateTrainingAssignmentSchema
>;
export type TrainingGroupView = z.infer<typeof TrainingGroupSchema>;
export type TrainingAssignmentView = z.infer<typeof TrainingAssignmentSchema>;
export type LiveTrainingSessionView = z.infer<typeof LiveTrainingSessionSchema>;
export type InstructorCallView = z.infer<typeof InstructorCallSchema>;
export type StudentStatsView = z.infer<typeof StudentStatsSchema>;
export type GroupStudentView = z.infer<typeof GroupStudentSchema>;
export type StudentView = z.infer<typeof StudentSchema>;
export type StudentListItemView = z.infer<typeof StudentListItemSchema>;
