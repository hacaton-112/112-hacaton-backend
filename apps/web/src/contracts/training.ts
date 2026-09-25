import { z } from "zod";

import { MethodicalMaterialSchema } from "./methodical-materials";

export const TrainingGroupStatusSchema = z.enum(["active", "archived"]);
export const TrainingAssignmentStatusSchema = z.enum([
  "draft",
  "in_progress",
  "completed",
  "archived",
]);
export const TrainingAssignmentTypeSchema = z.enum([
  "voice_call",
  "card_action",
  "mixed",
]);
/** Откуда берутся карточки занятия: генерация, билеты или звонки операторов. */
export const CardSourceSchema = z.enum([
  "generated",
  "ticket",
  "operator_call",
  "mixed",
]);
export const TrainingAttemptStatusSchema = z.enum([
  "offered",
  "active",
  "completed",
  "declined",
  "cancelled_by_instructor",
  "abandoned",
]);
export const CallStageSchema = z.enum([
  "offered",
  "conversation",
  "wrap_up",
  "ended",
  "declined",
]);

export const TrainingGroupMemberSchema = z.object({
  userId: z.uuid(),
  fullName: z.string(),
  email: z.email(),
  serviceTag: z.string(),
  joinedAt: z.iso.datetime(),
});

export const TrainingGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  organization: z.string(),
  instructorId: z.uuid(),
  status: TrainingGroupStatusSchema,
  members: z.array(TrainingGroupMemberSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const TrainingGroupListSchema = z.object({
  groups: z.array(TrainingGroupSchema),
});

export const OperatorOptionSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  email: z.email(),
});
export const OperatorOptionListSchema = z.object({
  operators: z.array(OperatorOptionSchema),
});

export const TrainingAssignmentSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  scenarioVersionId: z.uuid(),
  scenarioCode: z.string(),
  scenarioTitle: z.string(),
  category: z.string(),
  difficulty: z.number().int(),
  groupId: z.uuid().nullable(),
  groupName: z.string().nullable(),
  targetUserId: z.uuid().nullable(),
  type: TrainingAssignmentTypeSchema,
  cardSource: CardSourceSchema,
  serviceTag: z.string().nullable(),
  answerNormSeconds: z.number().int(),
  passThreshold: z.number().int(),
  maxAttempts: z.number().int().nullable(),
  dueDate: z.iso.datetime().nullable(),
  status: TrainingAssignmentStatusSchema,
  usedAttempts: z.number().int().nonnegative(),
  launchedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const TrainingAssignmentListSchema = z.object({
  assignments: z.array(TrainingAssignmentSchema),
});

export const ActiveTrainingAttemptSchema = z.object({
  trainingSessionId: z.uuid(),
  assignmentId: z.uuid(),
  assignmentTitle: z.string(),
  scenarioVersionId: z.uuid(),
  type: TrainingAssignmentTypeSchema,
  attemptNumber: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  exerciseId: z.uuid().nullable(),
});

export const MyTrainingAssignmentListSchema = z.object({
  assignments: z.array(TrainingAssignmentSchema),
  // Старый backend не присылает контекст блокирующей попытки.
  activeAttempt: ActiveTrainingAttemptSchema.nullable().default(null),
});

export const LiveTrainingSessionSchema = z.object({
  trainingSessionId: z.uuid(),
  assignmentId: z.uuid(),
  assignmentTitle: z.string(),
  groupId: z.uuid().nullable(),
  groupName: z.string().nullable(),
  scenarioCode: z.string(),
  scenarioTitle: z.string(),
  operatorId: z.uuid(),
  operatorName: z.string(),
  stage: z.enum(["offered", "conversation", "wrap_up"]),
  attemptStatus: z.enum(["offered", "active"]),
  panicLevel: z.number().int(),
  checklistSatisfied: z.number().int(),
  checklistTotal: z.number().int(),
  elapsedSeconds: z.number().int().nonnegative(),
  startedAt: z.iso.datetime(),
});
export const LiveTrainingSessionListSchema = z.object({
  sessions: z.array(LiveTrainingSessionSchema),
});

/** Звонок обучающегося по назначению — строка разборов в кабинете преподавателя. */
export const InstructorCallSchema = z.object({
  trainingSessionId: z.uuid(),
  assignmentId: z.uuid(),
  assignmentTitle: z.string(),
  groupId: z.uuid().nullable(),
  groupName: z.string().nullable(),
  operatorId: z.uuid(),
  operatorName: z.string(),
  scenarioCode: z.string(),
  title: z.string(),
  stage: CallStageSchema,
  offeredAt: z.iso.datetime(),
  answeredAt: z.iso.datetime().nullable(),
  endedAt: z.iso.datetime().nullable(),
  durationSeconds: z.number().int().nullable(),
  attemptNumber: z.number().int().positive(),
  attemptStatus: TrainingAttemptStatusSchema,
  answerNormSeconds: z.number().int().positive(),
  passThreshold: z.number().int(),
  score: z.number().int().nullable(),
});
export const InstructorCallListSchema = z.object({
  calls: z.array(InstructorCallSchema),
});

export const StudentStatsSchema = z.object({
  attempts: z.number().int().nonnegative(),
  completedAttempts: z.number().int().nonnegative(),
  evaluatedCalls: z.number().int().nonnegative(),
  passedCalls: z.number().int().nonnegative(),
  averageScore: z.number().int().nullable(),
  bestScore: z.number().int().nullable(),
  averageAnswerSeconds: z.number().int().nullable(),
  lastAttemptAt: z.iso.datetime().nullable(),
});

export const GroupStudentSchema = TrainingGroupMemberSchema.extend({
  stats: StudentStatsSchema,
});
export const GroupStudentListSchema = z.object({
  students: z.array(GroupStudentSchema),
});

export const StudentGroupSchema = z.object({
  groupId: z.uuid(),
  groupName: z.string(),
  serviceTag: z.string(),
});

/** Ученик в общем списке: группы и успеваемость — по занятиям преподавателя. */
export const StudentListItemSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  email: z.email(),
  groups: z.array(StudentGroupSchema),
  stats: StudentStatsSchema,
});
export const StudentListSchema = z.object({
  students: z.array(StudentListItemSchema),
});

/** Страница ученика: профиль, успеваемость и его звонки с разборами. */
export const StudentProfileSchema = z.object({
  student: z.object({
    id: z.uuid(),
    fullName: z.string(),
    email: z.email(),
    groups: z.array(
      z.object({
        groupId: z.uuid(),
        groupName: z.string(),
        serviceTag: z.string(),
      }),
    ),
  }),
  stats: StudentStatsSchema,
  calls: z.array(InstructorCallSchema),
  methodicalMaterials: z.array(MethodicalMaterialSchema).optional(),
});

export type TrainingGroup = z.infer<typeof TrainingGroupSchema>;
export type StudentStats = z.infer<typeof StudentStatsSchema>;
export type GroupStudent = z.infer<typeof GroupStudentSchema>;
export type StudentProfile = z.infer<typeof StudentProfileSchema>;
export type StudentListItem = z.infer<typeof StudentListItemSchema>;
export type TrainingGroupStatus = z.infer<typeof TrainingGroupStatusSchema>;
export type OperatorOption = z.infer<typeof OperatorOptionSchema>;
export type TrainingAssignment = z.infer<typeof TrainingAssignmentSchema>;
export type ActiveTrainingAttempt = z.infer<typeof ActiveTrainingAttemptSchema>;
export type TrainingAssignmentStatus = z.infer<
  typeof TrainingAssignmentStatusSchema
>;
export type CardSource = z.infer<typeof CardSourceSchema>;
export type TrainingAttemptStatus = z.infer<typeof TrainingAttemptStatusSchema>;
export type LiveTrainingSession = z.infer<typeof LiveTrainingSessionSchema>;
export type InstructorCall = z.infer<typeof InstructorCallSchema>;

export interface CreateTrainingGroup {
  name: string;
  code: string;
  organization: string;
  instructorId?: string;
}

export interface UpdateTrainingGroup {
  name?: string;
  code?: string;
  organization?: string;
  status?: TrainingGroupStatus;
  /** Передать группу другому преподавателю может только администратор. */
  instructorId?: string;
}

export interface AddTrainingGroupMember {
  userId: string;
  serviceTag: string;
}

/** Параметры занятия, которые можно поправить, пока назначение — черновик. */
export interface TrainingAssignmentSettings {
  title: string;
  cardSource: CardSource;
  serviceTag: string | null;
  answerNormSeconds: number;
  passThreshold: number;
  maxAttempts: number | null;
  dueDate: string | null;
}

/** Назначение адресуется либо группе, либо одному оператору. */
export type CreateTrainingAssignment = TrainingAssignmentSettings & {
  scenarioVersionId: string;
  type: "voice_call" | "card_action";
} & ({ groupId: string } | { targetUserId: string });

export type UpdateTrainingAssignment = Partial<TrainingAssignmentSettings>;

export type TrainingAssignmentAction =
  "launch" | "complete" | "archive" | "edit" | "delete";

/** Кому назначается занятие: группе целиком или одному ученику (ТЗ, стр. 10). */
export type AssignmentTarget =
  | { kind: "group"; group: TrainingGroup }
  | { kind: "student"; student: { id: string; fullName: string } };

export const isAssignmentForTarget = (
  assignment: Pick<TrainingAssignment, "groupId" | "targetUserId">,
  target: AssignmentTarget,
): boolean =>
  target.kind === "group"
    ? assignment.groupId === target.group.id
    : assignment.targetUserId === target.student.id;

/** Какие действия доступны назначению в его статусе — как на backend. */
export const assignmentActions = (
  status: TrainingAssignmentStatus,
): TrainingAssignmentAction[] => {
  switch (status) {
    case "draft":
      return ["launch", "edit", "archive", "delete"];
    case "in_progress":
      return ["complete"];
    case "completed":
      return ["archive"];
    case "archived":
      return [];
  }
};

/** Сколько попыток осталось; `null` — без ограничения. */
export const attemptsLeft = (
  assignment: Pick<TrainingAssignment, "maxAttempts" | "usedAttempts">,
): number | null =>
  assignment.maxAttempts === null
    ? null
    : Math.max(0, assignment.maxAttempts - assignment.usedAttempts);
