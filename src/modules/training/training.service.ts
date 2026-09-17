import { Inject, Injectable } from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  lt,
  notExists,
  or,
  type SQL,
} from "drizzle-orm";

import {
  AppBadRequestException,
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
} from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes, type ErrorCode } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callEvaluations,
  callStates,
  scenarios,
  scenarioVersions,
  trainingAssignments,
  trainingAttempts,
  trainingGroupMembers,
  trainingGroups,
  users,
  type TrainingAssignmentRecord,
  type TrainingAttemptStatus,
  type UserRole,
} from "@/drizzle/schema";
import { AuditLogService } from "@/modules/audit-log/audit-log.service";
import { ScenarioEngineService } from "@/modules/scenario-engine";

import type {
  AddTrainingGroupMember,
  CreateTrainingAssignment,
  CreateTrainingGroup,
  GroupStudentView,
  InstructorCallView,
  StudentListItemView,
  StudentStatsView,
  StudentView,
  LiveTrainingSessionView,
  TrainingAssignmentView,
  TrainingGroupView,
  UpdateTrainingAssignment,
  UpdateTrainingGroup,
  UpdateTrainingGroupMember,
} from "./dto/training.dto";

export interface TrainingActor {
  id: string;
  role: UserRole;
}

export interface OperatorMembership {
  groupId: string;
  serviceTag: string;
}

type AssignmentStatus = TrainingAssignmentRecord["status"];
export type AssignmentAction =
  "launch" | "complete" | "archive" | "update" | "delete";
type FinishedAttemptStatus = Exclude<
  TrainingAttemptStatus,
  "offered" | "active"
>;

const ACTIVE_ATTEMPT_STATUSES = ["offered", "active"] as const;
const MAX_INSTRUCTOR_CALLS = 200;
/** Столько живёт резерв попытки, звонок для которой так и не создался. */
const ORPHANED_RESERVATION_MS = 60_000;

const TRANSITIONS: Record<
  AssignmentAction,
  { from: readonly AssignmentStatus[]; to: AssignmentStatus | null }
> = {
  // Занятие запускает преподаватель: до запуска назначение не видно оператору.
  launch: { from: ["draft"], to: "in_progress" },
  complete: { from: ["in_progress"], to: "completed" },
  archive: { from: ["draft", "completed"], to: "archived" },
  // Идущее занятие не меняется: попытки должны оцениваться по одним правилам.
  update: { from: ["draft"], to: null },
  delete: { from: ["draft"], to: null },
};

/** Следующий статус назначения; `null` — действие не меняет статус. */
export const transitionAssignment = (
  status: AssignmentStatus,
  action: AssignmentAction,
): AssignmentStatus | null => {
  const transition = TRANSITIONS[action];
  if (!transition.from.includes(status)) {
    throw new Error(
      `Cannot ${action} an assignment in status ${status}; allowed from ${transition.from.join(", ")}`,
    );
  }
  return transition.to;
};

const sameServiceTag = (left: string, right: string): boolean =>
  left.trim().toUpperCase() === right.trim().toUpperCase();

/**
 * Назначение адресовано оператору.
 *
 * Групповое назначение со службой видят только участники группы, привязанные
 * к этой службе. Индивидуальное назначение адресовано человеку напрямую, и
 * служба его не сужает.
 */
export const isAssignedToOperator = (
  assignment: Pick<
    TrainingAssignmentRecord,
    "groupId" | "targetUserId" | "serviceTag"
  >,
  operatorId: string,
  memberships: readonly OperatorMembership[],
): boolean => {
  if (assignment.targetUserId !== null) {
    return assignment.targetUserId === operatorId;
  }
  return memberships.some(
    (membership) =>
      membership.groupId === assignment.groupId &&
      (assignment.serviceTag === null ||
        sameServiceTag(membership.serviceTag, assignment.serviceTag)),
  );
};

/** Почему новая попытка невозможна; `null` — можно начинать. */
export const attemptBlocker = (
  assignment: Pick<
    TrainingAssignmentRecord,
    "status" | "dueDate" | "maxAttempts"
  >,
  usedAttempts: number,
  now: Date,
): ErrorCode | null => {
  if (assignment.status !== "in_progress") {
    return ErrorCodes.ASSIGNMENT_NOT_AVAILABLE;
  }
  if (assignment.dueDate !== null && assignment.dueDate <= now) {
    return ErrorCodes.ASSIGNMENT_NOT_AVAILABLE;
  }
  if (
    assignment.maxAttempts !== null &&
    usedAttempts >= assignment.maxAttempts
  ) {
    return ErrorCodes.ASSIGNMENT_MAX_ATTEMPTS_REACHED;
  }
  return null;
};

const average = (values: readonly number[]): number | null =>
  values.length === 0
    ? null
    : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

/**
 * Успеваемость ученика по его звонкам.
 *
 * Балл есть только у оценённых звонков: оценка считается при первом открытии
 * разбора, поэтому страница ученика сначала дооценивает закончившиеся звонки.
 */
export const summarizeStudentCalls = (
  calls: readonly Pick<
    InstructorCallView,
    "offeredAt" | "answeredAt" | "attemptStatus" | "score" | "passThreshold"
  >[],
): StudentStatsView => {
  const scores = calls.flatMap(({ score }) => (score === null ? [] : [score]));
  const answerSeconds = calls.flatMap(({ offeredAt, answeredAt }) =>
    answeredAt === null
      ? []
      : [Math.max(0, (Date.parse(answeredAt) - Date.parse(offeredAt)) / 1_000)],
  );
  return {
    attempts: calls.length,
    completedAttempts: calls.filter(
      ({ attemptStatus }) => attemptStatus === "completed",
    ).length,
    evaluatedCalls: scores.length,
    passedCalls: calls.filter(
      ({ score, passThreshold }) => score !== null && score >= passThreshold,
    ).length,
    averageScore: average(scores),
    bestScore: scores.length === 0 ? null : Math.max(...scores),
    averageAnswerSeconds: average(answerSeconds),
    lastAttemptAt: calls.reduce<string | null>(
      (latest, { offeredAt }) =>
        latest === null || offeredAt > latest ? offeredAt : latest,
      null,
    ),
  };
};

const isUniqueViolation = (error: unknown): boolean => {
  for (
    let current: unknown = error;
    current instanceof Object;
    current = (current as { cause?: unknown }).cause
  ) {
    if ((current as { code?: unknown }).code === "23505") return true;
  }
  return false;
};

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

@Injectable()
export class TrainingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    private readonly audit: AuditLogService,
    private readonly engine: ScenarioEngineService,
  ) {}

  // ── Группы ──────────────────────────────────────────────────────────────

  async listGroups(actor: TrainingActor): Promise<TrainingGroupView[]> {
    const groupRows = await this.db
      .select()
      .from(trainingGroups)
      .where(
        actor.role === "admin"
          ? undefined
          : eq(trainingGroups.instructorId, actor.id),
      )
      .orderBy(asc(trainingGroups.name));

    if (groupRows.length === 0) return [];

    const memberRows = await this.db
      .select({
        groupId: trainingGroupMembers.groupId,
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        serviceTag: trainingGroupMembers.serviceTag,
        joinedAt: trainingGroupMembers.joinedAt,
      })
      .from(trainingGroupMembers)
      .innerJoin(users, eq(trainingGroupMembers.userId, users.id))
      .where(
        inArray(
          trainingGroupMembers.groupId,
          groupRows.map(({ id }) => id),
        ),
      )
      .orderBy(asc(users.fullName));

    return groupRows.map((group) => ({
      id: group.id,
      name: group.name,
      code: group.code,
      organization: group.organization,
      instructorId: group.instructorId,
      status: group.status,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      members: memberRows
        .filter((member) => member.groupId === group.id)
        .map(({ groupId: _groupId, joinedAt, ...member }) => ({
          ...member,
          joinedAt: joinedAt.toISOString(),
        })),
    }));
  }

  async getGroup(
    actor: TrainingActor,
    groupId: string,
  ): Promise<TrainingGroupView> {
    await this.requireManagedGroup(actor, groupId);
    const group = (await this.listGroups(actor)).find(
      ({ id }) => id === groupId,
    );
    if (!group) this.groupNotFound();
    return group;
  }

  async listOperators(): Promise<
    { id: string; fullName: string; email: string }[]
  > {
    return this.db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(and(eq(users.role, "operator"), eq(users.isActive, true)))
      .orderBy(asc(users.fullName));
  }

  async createGroup(
    actor: TrainingActor,
    input: CreateTrainingGroup,
  ): Promise<TrainingGroupView> {
    const duplicate = await this.db
      .select({ id: trainingGroups.id })
      .from(trainingGroups)
      .where(eq(trainingGroups.code, input.code))
      .limit(1);
    if (duplicate.length > 0) {
      throw new AppConflictException(
        ErrorCodes.GROUP_CODE_ALREADY_EXISTS,
        "A training group with this code already exists",
      );
    }

    let instructorId = actor.id;
    if (input.instructorId !== undefined) {
      if (actor.role !== "admin") {
        throw new AppForbiddenException(
          ErrorCodes.AUTH_ROLE_FORBIDDEN,
          "Only an administrator can assign a group to another instructor",
        );
      }
      const [instructor] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, input.instructorId),
            eq(users.role, "instructor"),
            eq(users.isActive, true),
          ),
        )
        .limit(1);
      if (!instructor) {
        throw new AppNotFoundException(
          ErrorCodes.AUTH_USER_NOT_FOUND,
          "The instructor does not exist",
        );
      }
      instructorId = instructor.id;
    }

    const { instructorId: _, ...groupFields } = input;

    const [created] = await this.db
      .insert(trainingGroups)
      .values({ ...groupFields, id: generateId(), instructorId })
      .returning();
    if (!created)
      throw new Error("The inserted training group was not returned");

    await this.audit.log({
      actorId: actor.id,
      action: "training.group.created",
      resource: "training-group",
      resourceId: created.id,
    });

    return {
      ...created,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      members: [],
    };
  }

  async updateGroup(
    actor: TrainingActor,
    groupId: string,
    input: UpdateTrainingGroup,
  ): Promise<TrainingGroupView> {
    await this.requireManagedGroup(actor, groupId);
    if (input.status === "archived") {
      await this.requireNoRunningAssignments(groupId);
    }
    if (input.instructorId !== undefined) {
      if (actor.role !== "admin") {
        throw new AppForbiddenException(
          ErrorCodes.AUTH_ROLE_FORBIDDEN,
          "Only an administrator can reassign a group",
        );
      }
      const [instructor] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, input.instructorId),
            eq(users.role, "instructor"),
            eq(users.isActive, true),
          ),
        )
        .limit(1);
      if (!instructor) {
        throw new AppNotFoundException(
          ErrorCodes.AUTH_USER_NOT_FOUND,
          "The instructor does not exist",
        );
      }
    }
    try {
      await this.db
        .update(trainingGroups)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(trainingGroups.id, groupId));
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new AppConflictException(
        ErrorCodes.GROUP_CODE_ALREADY_EXISTS,
        "A training group with this code already exists",
      );
    }
    await this.audit.log({
      actorId: actor.id,
      action: "training.group.updated",
      resource: "training-group",
      resourceId: groupId,
      details: { ...input },
    });
    const exact = (await this.listGroups(actor)).find(
      ({ id }) => id === groupId,
    );
    if (!exact) this.groupNotFound();
    return exact;
  }

  async deleteGroup(actor: TrainingActor, groupId: string): Promise<void> {
    await this.requireManagedGroup(actor, groupId);
    const [assignment] = await this.db
      .select({ id: trainingAssignments.id })
      .from(trainingAssignments)
      .where(eq(trainingAssignments.groupId, groupId))
      .limit(1);
    // История попыток ценнее пустого списка групп: такую группу архивируют.
    if (assignment) {
      throw new AppConflictException(
        ErrorCodes.GROUP_HAS_ASSIGNMENTS,
        "A group with assignments can only be archived",
      );
    }
    await this.db.delete(trainingGroups).where(eq(trainingGroups.id, groupId));
    await this.audit.log({
      actorId: actor.id,
      action: "training.group.deleted",
      resource: "training-group",
      resourceId: groupId,
    });
  }

  async addMember(
    actor: TrainingActor,
    groupId: string,
    input: AddTrainingGroupMember,
  ): Promise<void> {
    const group = await this.requireManagedGroup(actor, groupId);
    if (group.status !== "active") {
      throw new AppBadRequestException(
        ErrorCodes.GROUP_ARCHIVED,
        "Members cannot be added to an archived group",
      );
    }

    const [operator] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, input.userId),
          eq(users.role, "operator"),
          eq(users.isActive, true),
        ),
      )
      .limit(1);
    if (!operator) {
      throw new AppNotFoundException(
        ErrorCodes.AUTH_USER_NOT_FOUND,
        "The operator does not exist",
      );
    }

    try {
      await this.db.insert(trainingGroupMembers).values({
        id: generateId(),
        groupId,
        userId: input.userId,
        serviceTag: input.serviceTag,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new AppConflictException(
        ErrorCodes.GROUP_MEMBER_EXISTS,
        "The operator is already in this group",
      );
    }
    await this.audit.log({
      actorId: actor.id,
      action: "training.group.member_added",
      resource: "training-group",
      resourceId: groupId,
      details: { userId: input.userId, serviceTag: input.serviceTag },
    });
  }

  async updateMember(
    actor: TrainingActor,
    groupId: string,
    userId: string,
    input: UpdateTrainingGroupMember,
  ): Promise<void> {
    await this.requireManagedGroup(actor, groupId);
    const updated = await this.db
      .update(trainingGroupMembers)
      .set({ serviceTag: input.serviceTag })
      .where(
        and(
          eq(trainingGroupMembers.groupId, groupId),
          eq(trainingGroupMembers.userId, userId),
        ),
      )
      .returning({ id: trainingGroupMembers.id });
    if (updated.length === 0) {
      throw new AppNotFoundException(
        ErrorCodes.GROUP_MEMBER_NOT_FOUND,
        "The student is not in this group",
      );
    }
    await this.audit.log({
      actorId: actor.id,
      action: "training.group.member_updated",
      resource: "training-group",
      resourceId: groupId,
      details: { userId, serviceTag: input.serviceTag },
    });
  }

  async removeMember(
    actor: TrainingActor,
    groupId: string,
    userId: string,
  ): Promise<void> {
    await this.requireManagedGroup(actor, groupId);
    await this.db
      .delete(trainingGroupMembers)
      .where(
        and(
          eq(trainingGroupMembers.groupId, groupId),
          eq(trainingGroupMembers.userId, userId),
        ),
      );
    await this.audit.log({
      actorId: actor.id,
      action: "training.group.member_removed",
      resource: "training-group",
      resourceId: groupId,
      details: { userId },
    });
  }

  // ── Назначения ──────────────────────────────────────────────────────────

  async createAssignment(
    actor: TrainingActor,
    input: CreateTrainingAssignment,
  ): Promise<TrainingAssignmentView> {
    this.requireFutureDueDate(input.dueDate);
    await this.requirePublishedVersion(input.scenarioVersionId);

    if (input.groupId) {
      const group = await this.requireManagedGroup(actor, input.groupId);
      if (group.status !== "active") {
        throw new AppBadRequestException(
          ErrorCodes.GROUP_ARCHIVED,
          "An assignment requires an active group",
        );
      }
    } else if (input.targetUserId) {
      await this.requireOperator(input.targetUserId);
    }

    const [created] = await this.db
      .insert(trainingAssignments)
      .values({
        ...input,
        id: generateId(),
        createdBy: actor.id,
        // Служба сужает только групповое назначение.
        serviceTag: input.groupId ? input.serviceTag : null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      })
      .returning();
    if (!created) throw new Error("The inserted assignment was not returned");

    await this.audit.log({
      actorId: actor.id,
      action: "training.assignment.created",
      resource: "training-assignment",
      resourceId: created.id,
    });
    return this.requireAssignmentView(created.id);
  }

  async updateAssignment(
    actor: TrainingActor,
    assignmentId: string,
    input: UpdateTrainingAssignment,
  ): Promise<TrainingAssignmentView> {
    const assignment = await this.requireManagedAssignment(actor, assignmentId);
    this.requireTransition(assignment.status, "update");
    this.requireFutureDueDate(input.dueDate);

    const { dueDate, serviceTag, ...rest } = input;
    await this.db
      .update(trainingAssignments)
      .set({
        ...rest,
        ...(dueDate === undefined
          ? {}
          : { dueDate: dueDate === null ? null : new Date(dueDate) }),
        ...(serviceTag === undefined || assignment.groupId === null
          ? {}
          : { serviceTag }),
        updatedAt: new Date(),
      })
      .where(eq(trainingAssignments.id, assignmentId));
    await this.audit.log({
      actorId: actor.id,
      action: "training.assignment.updated",
      resource: "training-assignment",
      resourceId: assignmentId,
      details: { ...input },
    });
    return this.requireAssignmentView(assignmentId);
  }

  async deleteAssignment(
    actor: TrainingActor,
    assignmentId: string,
  ): Promise<void> {
    const assignment = await this.requireManagedAssignment(actor, assignmentId);
    this.requireTransition(assignment.status, "delete");
    await this.db
      .delete(trainingAssignments)
      .where(eq(trainingAssignments.id, assignmentId));
    await this.audit.log({
      actorId: actor.id,
      action: "training.assignment.deleted",
      resource: "training-assignment",
      resourceId: assignmentId,
    });
  }

  async listAssignments(
    actor: TrainingActor,
  ): Promise<TrainingAssignmentView[]> {
    return this.withAttemptCounts(
      await this.assignmentRows(this.assignmentScope(actor)),
    );
  }

  /** Лента оператора: только запущенные занятия, адресованные ему. */
  async listMyAssignments(
    operatorId: string,
  ): Promise<TrainingAssignmentView[]> {
    const memberships = await this.operatorMemberships(operatorId);
    const groupIds = memberships.map(({ groupId }) => groupId);
    const rows = await this.assignmentRows(
      and(
        eq(trainingAssignments.status, "in_progress"),
        groupIds.length === 0
          ? eq(trainingAssignments.targetUserId, operatorId)
          : or(
              eq(trainingAssignments.targetUserId, operatorId),
              inArray(trainingAssignments.groupId, groupIds),
            ),
      ),
    );
    const now = new Date();
    // Исчерпанные попытки остаются в ленте: оператор должен видеть, почему
    // занятие больше не запускается.
    return this.withAttemptCounts(
      rows.filter(
        (row) =>
          isAssignedToOperator(row, operatorId, memberships) &&
          (row.dueDate === null || row.dueDate > now),
      ),
      operatorId,
    );
  }

  async listScenarioVersionIdsForOperator(
    operatorId: string,
  ): Promise<string[]> {
    return (await this.listMyAssignments(operatorId)).map(
      ({ scenarioVersionId }) => scenarioVersionId,
    );
  }

  async launchAssignmentById(
    actor: TrainingActor,
    assignmentId: string,
  ): Promise<TrainingAssignmentView> {
    const assignment = await this.requireManagedAssignment(actor, assignmentId);
    this.requireTransition(assignment.status, "launch");
    if (assignment.dueDate && assignment.dueDate <= new Date()) {
      throw new AppBadRequestException(
        ErrorCodes.ASSIGNMENT_INVALID_DUE_DATE,
        "An expired assignment cannot be launched",
      );
    }
    const now = new Date();
    await this.db
      .update(trainingAssignments)
      .set({ status: "in_progress", launchedAt: now, updatedAt: now })
      .where(
        and(
          eq(trainingAssignments.id, assignmentId),
          eq(trainingAssignments.status, "draft"),
        ),
      );
    await this.audit.log({
      actorId: actor.id,
      action: "training.assignment.launched",
      resource: "training-assignment",
      resourceId: assignmentId,
    });
    return this.requireAssignmentView(assignmentId);
  }

  async completeAssignmentById(
    actor: TrainingActor,
    assignmentId: string,
  ): Promise<TrainingAssignmentView> {
    const assignment = await this.requireManagedAssignment(actor, assignmentId);
    this.requireTransition(assignment.status, "complete");
    await this.closeOrphanedAttempts(
      eq(trainingAttempts.assignmentId, assignmentId),
    );

    await this.db.transaction(async (tx) => {
      // Блокировка строки не даёт оператору начать попытку, пока занятие
      // закрывается.
      await tx
        .select({ id: trainingAssignments.id })
        .from(trainingAssignments)
        .where(eq(trainingAssignments.id, assignmentId))
        .for("update");
      const [active] = await tx
        .select({ id: trainingAttempts.id })
        .from(trainingAttempts)
        .where(
          and(
            eq(trainingAttempts.assignmentId, assignmentId),
            inArray(trainingAttempts.status, ACTIVE_ATTEMPT_STATUSES),
          ),
        )
        .limit(1);
      if (active) {
        throw new AppConflictException(
          ErrorCodes.ASSIGNMENT_HAS_ACTIVE_ATTEMPTS,
          "End active sessions before completing the assignment",
        );
      }
      const now = new Date();
      await tx
        .update(trainingAssignments)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(
          and(
            eq(trainingAssignments.id, assignmentId),
            eq(trainingAssignments.status, "in_progress"),
          ),
        );
    });

    await this.audit.log({
      actorId: actor.id,
      action: "training.assignment.completed",
      resource: "training-assignment",
      resourceId: assignmentId,
    });
    return this.requireAssignmentView(assignmentId);
  }

  async archiveAssignmentById(
    actor: TrainingActor,
    assignmentId: string,
  ): Promise<TrainingAssignmentView> {
    const assignment = await this.requireManagedAssignment(actor, assignmentId);
    this.requireTransition(assignment.status, "archive");
    await this.db
      .update(trainingAssignments)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(trainingAssignments.id, assignmentId));
    await this.audit.log({
      actorId: actor.id,
      action: "training.assignment.archived",
      resource: "training-assignment",
      resourceId: assignmentId,
    });
    return this.requireAssignmentView(assignmentId);
  }

  // ── Попытки ─────────────────────────────────────────────────────────────

  /**
   * Резервирует попытку до создания звонка.
   *
   * Проверка лимита и запись попытки идут в одной транзакции под блокировкой
   * назначения, поэтому два одновременных старта не получат один номер и не
   * превысят лимит. Второй активный звонок оператора отсекает частичный
   * уникальный индекс.
   */
  async reserveAttempt(input: {
    assignmentId: string;
    operatorId: string;
    scenarioVersionId: string;
    trainingSessionId: string;
  }): Promise<number> {
    await this.closeOrphanedAttempts(
      eq(trainingAttempts.operatorId, input.operatorId),
    );
    const memberships = await this.operatorMemberships(input.operatorId);

    try {
      return await this.db.transaction(async (tx) => {
        const [assignment] = await tx
          .select()
          .from(trainingAssignments)
          .where(eq(trainingAssignments.id, input.assignmentId))
          .for("update");
        if (
          !assignment ||
          assignment.scenarioVersionId !== input.scenarioVersionId ||
          !isAssignedToOperator(assignment, input.operatorId, memberships)
        ) {
          this.assignmentNotAvailable();
        }

        const attempts = await tx
          .select({ status: trainingAttempts.status })
          .from(trainingAttempts)
          .where(
            and(
              eq(trainingAttempts.assignmentId, input.assignmentId),
              eq(trainingAttempts.operatorId, input.operatorId),
            ),
          );
        const blocker = attemptBlocker(assignment, attempts.length, new Date());
        if (blocker === ErrorCodes.ASSIGNMENT_MAX_ATTEMPTS_REACHED) {
          throw new AppConflictException(
            blocker,
            "The operator has used every attempt of this assignment",
          );
        }
        if (blocker !== null) this.assignmentNotAvailable();

        const attemptNumber = attempts.length + 1;
        await tx.insert(trainingAttempts).values({
          id: generateId(),
          assignmentId: input.assignmentId,
          operatorId: input.operatorId,
          trainingSessionId: input.trainingSessionId,
          attemptNumber,
          status: "offered",
        });
        return attemptNumber;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new AppConflictException(
        ErrorCodes.ASSIGNMENT_ATTEMPT_ACTIVE,
        "The operator already has an active attempt",
      );
    }
  }

  async activateAttempt(trainingSessionId: string): Promise<void> {
    await this.db
      .update(trainingAttempts)
      .set({ status: "active" })
      .where(
        and(
          eq(trainingAttempts.trainingSessionId, trainingSessionId),
          eq(trainingAttempts.status, "offered"),
        ),
      );
  }

  /**
   * Закрывает попытку. Выигрывает первый финал: отключение оператора после
   * завершения преподавателем не превращает попытку в брошенную.
   */
  async finishAttempt(
    trainingSessionId: string,
    status: FinishedAttemptStatus,
  ): Promise<boolean> {
    const updated = await this.db
      .update(trainingAttempts)
      .set({ status, endedAt: new Date() })
      .where(
        and(
          eq(trainingAttempts.trainingSessionId, trainingSessionId),
          inArray(trainingAttempts.status, ACTIVE_ATTEMPT_STATUSES),
        ),
      )
      .returning({ id: trainingAttempts.id });
    return updated.length > 0;
  }

  /**
   * Закрывает попытки, звонок которых уже закончился без gateway: его закрыла
   * уборка брошенных звонков после падения процесса, или звонок так и не
   * создался. Иначе такая попытка навсегда держала бы оператора «в звонке».
   */
  private async closeOrphanedAttempts(scope: SQL): Promise<void> {
    await this.db
      .update(trainingAttempts)
      .set({ status: "abandoned", endedAt: new Date() })
      .where(
        and(
          scope,
          inArray(trainingAttempts.status, ACTIVE_ATTEMPT_STATUSES),
          or(
            inArray(
              trainingAttempts.trainingSessionId,
              this.db
                .select({ id: callStates.trainingSessionId })
                .from(callStates)
                .where(inArray(callStates.stage, ["ended", "declined"])),
            ),
            and(
              lt(
                trainingAttempts.startedAt,
                new Date(Date.now() - ORPHANED_RESERVATION_MS),
              ),
              notExists(
                this.db
                  .select({ id: callStates.trainingSessionId })
                  .from(callStates)
                  .where(
                    eq(
                      callStates.trainingSessionId,
                      trainingAttempts.trainingSessionId,
                    ),
                  ),
              ),
            ),
          ),
        ),
      );
  }

  // ── Кабинет преподавателя ──────────────────────────────────────────────

  async listLiveSessions(
    actor: TrainingActor,
    groupId?: string,
  ): Promise<LiveTrainingSessionView[]> {
    const rows = await this.db
      .select({
        trainingSessionId: trainingAttempts.trainingSessionId,
        assignmentId: trainingAssignments.id,
        assignmentTitle: trainingAssignments.title,
        groupId: trainingAssignments.groupId,
        groupName: trainingGroups.name,
        scenarioCode: scenarios.code,
        scenarioTitle: scenarios.title,
        operatorId: trainingAttempts.operatorId,
        operatorName: users.fullName,
        attemptStatus: trainingAttempts.status,
        stage: callStates.stage,
        panicLevel: callStates.panicLevel,
        startedAt: trainingAttempts.startedAt,
      })
      .from(trainingAttempts)
      .innerJoin(
        trainingAssignments,
        eq(trainingAttempts.assignmentId, trainingAssignments.id),
      )
      .innerJoin(
        scenarioVersions,
        eq(trainingAssignments.scenarioVersionId, scenarioVersions.id),
      )
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .leftJoin(
        trainingGroups,
        eq(trainingAssignments.groupId, trainingGroups.id),
      )
      .innerJoin(users, eq(trainingAttempts.operatorId, users.id))
      .innerJoin(
        callStates,
        eq(trainingAttempts.trainingSessionId, callStates.trainingSessionId),
      )
      .where(
        and(
          inArray(trainingAttempts.status, ACTIVE_ATTEMPT_STATUSES),
          inArray(callStates.stage, ["offered", "conversation", "wrap_up"]),
          this.assignmentScope(actor),
          groupId ? eq(trainingAssignments.groupId, groupId) : undefined,
        ),
      )
      .orderBy(asc(trainingAttempts.startedAt));

    return Promise.all(
      rows.map(async (row) => {
        const snapshot = await this.engine.getSnapshot(row.trainingSessionId);
        return {
          ...row,
          checklistSatisfied: snapshot.checklistSatisfied,
          checklistTotal: snapshot.checklistTotal,
          elapsedSeconds: Math.max(
            0,
            Math.floor((Date.now() - row.startedAt.getTime()) / 1_000),
          ),
          startedAt: row.startedAt.toISOString(),
        };
      }),
    );
  }

  /** Звонки обучающихся по назначениям преподавателя и его групп. */
  async listInstructorCalls(
    actor: TrainingActor,
    filter: {
      groupId?: string;
      operatorId?: string;
      from?: Date;
      to?: Date;
      /** Статистике нужны все звонки, списку разборов — последние. */
      everyCall?: boolean;
      /** Отчёты читают на одну строку больше лимита, чтобы не обрезать молча. */
      limit?: number;
    } = {},
  ): Promise<InstructorCallView[]> {
    const query = this.db
      .select({
        trainingSessionId: trainingAttempts.trainingSessionId,
        assignmentId: trainingAssignments.id,
        assignmentTitle: trainingAssignments.title,
        groupId: trainingAssignments.groupId,
        groupName: trainingGroups.name,
        operatorId: trainingAttempts.operatorId,
        operatorName: users.fullName,
        scenarioCode: scenarios.code,
        title: scenarios.title,
        stage: callStates.stage,
        offeredAt: callStates.offeredAt,
        answeredAt: callStates.answeredAt,
        endedAt: callStates.endedAt,
        attemptNumber: trainingAttempts.attemptNumber,
        attemptStatus: trainingAttempts.status,
        answerNormSeconds: trainingAssignments.answerNormSeconds,
        passThreshold: trainingAssignments.passThreshold,
        score: callEvaluations.score,
      })
      .from(trainingAttempts)
      .innerJoin(
        trainingAssignments,
        eq(trainingAttempts.assignmentId, trainingAssignments.id),
      )
      .innerJoin(
        callStates,
        eq(trainingAttempts.trainingSessionId, callStates.trainingSessionId),
      )
      .innerJoin(
        scenarioVersions,
        eq(callStates.scenarioVersionId, scenarioVersions.id),
      )
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .innerJoin(users, eq(trainingAttempts.operatorId, users.id))
      .leftJoin(
        trainingGroups,
        eq(trainingAssignments.groupId, trainingGroups.id),
      )
      .leftJoin(
        callEvaluations,
        eq(
          trainingAttempts.trainingSessionId,
          callEvaluations.trainingSessionId,
        ),
      )
      .where(
        and(
          this.assignmentScope(actor),
          filter.groupId
            ? eq(trainingAssignments.groupId, filter.groupId)
            : undefined,
          filter.operatorId
            ? eq(trainingAttempts.operatorId, filter.operatorId)
            : undefined,
          filter.from ? gte(callStates.offeredAt, filter.from) : undefined,
          filter.to ? lte(callStates.offeredAt, filter.to) : undefined,
        ),
      )
      .orderBy(desc(callStates.offeredAt))
      .$dynamic();
    const rows = await (filter.limit !== undefined
      ? query.limit(filter.limit)
      : filter.everyCall
        ? query
        : query.limit(MAX_INSTRUCTOR_CALLS));

    return rows.map((row) => ({
      ...row,
      offeredAt: row.offeredAt.toISOString(),
      answeredAt: iso(row.answeredAt),
      endedAt: iso(row.endedAt),
      durationSeconds:
        row.answeredAt === null || row.endedAt === null
          ? null
          : Math.max(
              0,
              Math.round(
                (row.endedAt.getTime() - row.answeredAt.getTime()) / 1_000,
              ),
            ),
    }));
  }

  /** Ученики группы и сводка их попыток по назначениям. */
  async listGroupStudents(
    actor: TrainingActor,
    groupId: string,
  ): Promise<GroupStudentView[]> {
    const group = await this.getGroup(actor, groupId);
    const calls = await this.listInstructorCalls(actor, {
      groupId,
      everyCall: true,
    });
    return group.members.map((member) => ({
      ...member,
      stats: summarizeStudentCalls(
        calls.filter(({ operatorId }) => operatorId === member.userId),
      ),
    }));
  }

  /**
   * Все ученики: исключённый из группы не должен пропадать из вида.
   *
   * Учётные записи операторов преподаватель и так видит, когда добавляет
   * учеников в группу. Группы и успеваемость — только по его группам и
   * занятиям: чужая работа остаётся чужой.
   */
  async listStudents(actor: TrainingActor): Promise<StudentListItemView[]> {
    const [students, memberships, calls] = await Promise.all([
      this.db
        .select({ id: users.id, fullName: users.fullName, email: users.email })
        .from(users)
        .where(eq(users.role, "operator"))
        .orderBy(asc(users.fullName)),
      this.studentGroups(actor),
      this.listInstructorCalls(actor, { everyCall: true }),
    ]);

    return students.map((student) => ({
      ...student,
      groups: memberships
        .filter(({ userId }) => userId === student.id)
        .map(({ userId: _userId, ...group }) => group),
      stats: summarizeStudentCalls(
        calls.filter(({ operatorId }) => operatorId === student.id),
      ),
    }));
  }

  /**
   * Ученик для страницы преподавателя. Открывается и после исключения из
   * группы; группы и разборы у него — только по занятиям этого преподавателя.
   */
  async requireManagedStudent(
    actor: TrainingActor,
    userId: string,
  ): Promise<StudentView> {
    const [student] = await this.db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.role, "operator"),
          eq(users.isActive, true),
        ),
      )
      .limit(1);
    if (!student) {
      throw new AppNotFoundException(
        ErrorCodes.AUTH_USER_NOT_FOUND,
        "The student does not exist",
      );
    }
    const groups = (await this.studentGroups(actor, userId)).map(
      ({ userId: _userId, ...group }) => group,
    );
    return { ...student, groups };
  }

  /** Членства в группах, которые видит преподаватель; администратор — все. */
  private async studentGroups(actor: TrainingActor, userId?: string) {
    return this.db
      .select({
        userId: trainingGroupMembers.userId,
        groupId: trainingGroups.id,
        groupName: trainingGroups.name,
        serviceTag: trainingGroupMembers.serviceTag,
      })
      .from(trainingGroupMembers)
      .innerJoin(
        trainingGroups,
        eq(trainingGroupMembers.groupId, trainingGroups.id),
      )
      .where(
        and(
          userId ? eq(trainingGroupMembers.userId, userId) : undefined,
          actor.role === "admin"
            ? undefined
            : eq(trainingGroups.instructorId, actor.id),
        ),
      )
      .orderBy(asc(trainingGroups.name));
  }

  /**
   * Сессия, которую преподаватель вправе разбирать или останавливать.
   *
   * Чужая сессия неотличима от несуществующей, как и в разборе оператора.
   */
  async requireManagedSession(
    actor: TrainingActor,
    trainingSessionId: string,
  ): Promise<{
    operatorId: string;
    attemptStatus: TrainingAttemptStatus | null;
  }> {
    const [row] = await this.db
      .select({
        operatorId: trainingAttempts.operatorId,
        attemptStatus: trainingAttempts.status,
        createdBy: trainingAssignments.createdBy,
        groupInstructorId: trainingGroups.instructorId,
      })
      .from(trainingAttempts)
      .innerJoin(
        trainingAssignments,
        eq(trainingAttempts.assignmentId, trainingAssignments.id),
      )
      .leftJoin(
        trainingGroups,
        eq(trainingAssignments.groupId, trainingGroups.id),
      )
      .where(eq(trainingAttempts.trainingSessionId, trainingSessionId))
      .limit(1);

    if (row) {
      if (
        actor.role === "admin" ||
        row.createdBy === actor.id ||
        row.groupInstructorId === actor.id
      ) {
        return { operatorId: row.operatorId, attemptStatus: row.attemptStatus };
      }
    } else if (actor.role === "admin") {
      // Свободный звонок вне назначения доступен только администратору.
      const [call] = await this.db
        .select({ operatorId: callStates.operatorId })
        .from(callStates)
        .where(eq(callStates.trainingSessionId, trainingSessionId))
        .limit(1);
      if (call?.operatorId) {
        return { operatorId: call.operatorId, attemptStatus: null };
      }
    }

    throw new AppNotFoundException(
      ErrorCodes.CALL_NOT_FOUND,
      "There is no call for this training session",
    );
  }

  async auditInstructorEnd(
    actorId: string,
    trainingSessionId: string,
    reason: string,
  ): Promise<void> {
    await this.audit.log({
      actorId,
      action: "training.session.ended_by_instructor",
      resource: "training-session",
      resourceId: trainingSessionId,
      sessionId: trainingSessionId,
      details: { reason },
    });
  }

  // ── Внутреннее ──────────────────────────────────────────────────────────

  /** Назначения, которыми управляет преподаватель: свои и своих групп. */
  private assignmentScope(actor: TrainingActor): SQL | undefined {
    if (actor.role === "admin") return undefined;
    return or(
      eq(trainingAssignments.createdBy, actor.id),
      inArray(
        trainingAssignments.groupId,
        this.db
          .select({ id: trainingGroups.id })
          .from(trainingGroups)
          .where(eq(trainingGroups.instructorId, actor.id)),
      ),
    );
  }

  private async operatorMemberships(
    operatorId: string,
  ): Promise<OperatorMembership[]> {
    return this.db
      .select({
        groupId: trainingGroupMembers.groupId,
        serviceTag: trainingGroupMembers.serviceTag,
      })
      .from(trainingGroupMembers)
      .innerJoin(
        trainingGroups,
        eq(trainingGroupMembers.groupId, trainingGroups.id),
      )
      .where(
        and(
          eq(trainingGroupMembers.userId, operatorId),
          eq(trainingGroups.status, "active"),
        ),
      );
  }

  private async assignmentRows(where?: SQL) {
    return this.db
      .select({
        id: trainingAssignments.id,
        title: trainingAssignments.title,
        scenarioVersionId: trainingAssignments.scenarioVersionId,
        scenarioCode: scenarios.code,
        scenarioTitle: scenarios.title,
        category: scenarios.category,
        difficulty: scenarios.difficulty,
        groupId: trainingAssignments.groupId,
        groupName: trainingGroups.name,
        targetUserId: trainingAssignments.targetUserId,
        type: trainingAssignments.type,
        cardSource: trainingAssignments.cardSource,
        serviceTag: trainingAssignments.serviceTag,
        answerNormSeconds: trainingAssignments.answerNormSeconds,
        passThreshold: trainingAssignments.passThreshold,
        maxAttempts: trainingAssignments.maxAttempts,
        dueDate: trainingAssignments.dueDate,
        status: trainingAssignments.status,
        launchedAt: trainingAssignments.launchedAt,
        completedAt: trainingAssignments.completedAt,
        createdAt: trainingAssignments.createdAt,
      })
      .from(trainingAssignments)
      .innerJoin(
        scenarioVersions,
        eq(trainingAssignments.scenarioVersionId, scenarioVersions.id),
      )
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .leftJoin(
        trainingGroups,
        eq(trainingAssignments.groupId, trainingGroups.id),
      )
      .where(where)
      .orderBy(desc(trainingAssignments.createdAt));
  }

  /** Для оператора — его попытки, для преподавателя — попытки всей группы. */
  private async withAttemptCounts(
    rows: Awaited<ReturnType<TrainingService["assignmentRows"]>>,
    operatorId?: string,
  ): Promise<TrainingAssignmentView[]> {
    if (rows.length === 0) return [];
    const counts = await this.db
      .select({
        assignmentId: trainingAttempts.assignmentId,
        attempts: count(),
      })
      .from(trainingAttempts)
      .where(
        and(
          inArray(
            trainingAttempts.assignmentId,
            rows.map(({ id }) => id),
          ),
          operatorId ? eq(trainingAttempts.operatorId, operatorId) : undefined,
        ),
      )
      .groupBy(trainingAttempts.assignmentId);
    const used = new Map(
      counts.map(({ assignmentId, attempts }) => [assignmentId, attempts]),
    );
    return rows.map((row) => ({
      ...row,
      usedAttempts: used.get(row.id) ?? 0,
      dueDate: iso(row.dueDate),
      launchedAt: iso(row.launchedAt),
      completedAt: iso(row.completedAt),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async requireAssignmentView(
    assignmentId: string,
  ): Promise<TrainingAssignmentView> {
    const [assignment] = await this.withAttemptCounts(
      await this.assignmentRows(eq(trainingAssignments.id, assignmentId)),
    );
    if (!assignment) this.assignmentNotFound();
    return assignment;
  }

  private async requireManagedAssignment(
    actor: TrainingActor,
    assignmentId: string,
  ): Promise<TrainingAssignmentRecord> {
    const [row] = await this.db
      .select({
        assignment: trainingAssignments,
        groupInstructorId: trainingGroups.instructorId,
      })
      .from(trainingAssignments)
      .leftJoin(
        trainingGroups,
        eq(trainingAssignments.groupId, trainingGroups.id),
      )
      .where(eq(trainingAssignments.id, assignmentId))
      .limit(1);
    if (!row) this.assignmentNotFound();
    if (
      actor.role !== "admin" &&
      row.assignment.createdBy !== actor.id &&
      row.groupInstructorId !== actor.id
    ) {
      throw new AppForbiddenException(
        ErrorCodes.AUTH_ROLE_FORBIDDEN,
        "The assignment belongs to another instructor",
      );
    }
    return row.assignment;
  }

  private async requireManagedGroup(actor: TrainingActor, groupId: string) {
    const [group] = await this.db
      .select()
      .from(trainingGroups)
      .where(eq(trainingGroups.id, groupId))
      .limit(1);
    if (!group) this.groupNotFound();
    if (actor.role !== "admin" && group.instructorId !== actor.id) {
      throw new AppForbiddenException(
        ErrorCodes.AUTH_ROLE_FORBIDDEN,
        "The group belongs to another instructor",
      );
    }
    return group;
  }

  private async requireNoRunningAssignments(groupId: string): Promise<void> {
    const [running] = await this.db
      .select({ id: trainingAssignments.id })
      .from(trainingAssignments)
      .where(
        and(
          eq(trainingAssignments.groupId, groupId),
          eq(trainingAssignments.status, "in_progress"),
        ),
      )
      .limit(1);
    if (running) {
      throw new AppConflictException(
        ErrorCodes.GROUP_HAS_RUNNING_ASSIGNMENTS,
        "Complete the running assignments before archiving the group",
      );
    }
  }

  private async requirePublishedVersion(scenarioVersionId: string) {
    const [version] = await this.db
      .select({ id: scenarioVersions.id })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .where(
        and(
          eq(scenarioVersions.id, scenarioVersionId),
          isNotNull(scenarioVersions.publishedAt),
          eq(scenarios.status, "published"),
        ),
      )
      .limit(1);
    if (!version) {
      throw new AppBadRequestException(
        ErrorCodes.SCENARIO_VERSION_NOT_FOUND,
        "The scenario version is not published",
      );
    }
  }

  private async requireOperator(userId: string): Promise<void> {
    const [operator] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.role, "operator")))
      .limit(1);
    if (!operator) {
      throw new AppNotFoundException(
        ErrorCodes.AUTH_USER_NOT_FOUND,
        "The target operator does not exist",
      );
    }
  }

  private requireFutureDueDate(dueDate: string | null | undefined): void {
    if (dueDate && new Date(dueDate) <= new Date()) {
      throw new AppBadRequestException(
        ErrorCodes.ASSIGNMENT_INVALID_DUE_DATE,
        "The assignment due date must be in the future",
      );
    }
  }

  private requireTransition(
    status: AssignmentStatus,
    action: AssignmentAction,
  ): void {
    try {
      transitionAssignment(status, action);
    } catch (error) {
      throw new AppConflictException(
        ErrorCodes.ASSIGNMENT_STATE_INVALID,
        error instanceof Error ? error.message : "Invalid assignment state",
      );
    }
  }

  private assignmentNotAvailable(): never {
    throw new AppForbiddenException(
      ErrorCodes.ASSIGNMENT_NOT_AVAILABLE,
      "This assignment is not available to the operator",
    );
  }

  private groupNotFound(): never {
    throw new AppNotFoundException(
      ErrorCodes.GROUP_NOT_FOUND,
      "The training group does not exist",
    );
  }

  private assignmentNotFound(): never {
    throw new AppNotFoundException(
      ErrorCodes.ASSIGNMENT_NOT_FOUND,
      "The assignment does not exist",
    );
  }
}
