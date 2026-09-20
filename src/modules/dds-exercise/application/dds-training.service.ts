import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { AppBadRequestException, AppConflictException, AppNotFoundException } from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  ddsExercises, ddsExerciseEvents, ddsExerciseReviews, trainingAssignments,
  trainingAttempts, trainingGroups, trainingGroupMembers, users,
} from "@/drizzle/schema";
import { AuditLogService } from "@/modules/audit-log/audit-log.service";
import { attemptBlocker, isAssignedToOperator, type TrainingActor } from "@/modules/training/training.service";
import { buildDdsCardSnapshot } from "../domain/dds-card-snapshot";
import { DDS_EXERCISE_STORE, type DdsExerciseStore } from "../ports/dds-exercise.store.port";
import type { DdsTrainingAttempt, ReviewDdsDto } from "../dto/dds-training.dto";
import { DdsExerciseService } from "./dds-exercise.service";

type Database = DrizzleService["db"];

/** Assignment orchestration only; card transitions and assessment stay in DDS domain. */
@Injectable()
export class DdsTrainingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(DDS_EXERCISE_STORE) private readonly store: DdsExerciseStore,
    private readonly exercises: DdsExerciseService,
    private readonly audit: AuditLogService,
  ) {}

  async start(operatorId: string, assignmentId: string, eventId: string) {
    const exerciseId = await this.db.transaction(async (tx) => {
      // Same assignment lock as voice starts / instructor completion.
      const [assignment] = await tx.select().from(trainingAssignments)
        .where(eq(trainingAssignments.id, assignmentId)).for("update");
      const memberships = await tx.select({ groupId: trainingGroupMembers.groupId, serviceTag: trainingGroupMembers.serviceTag })
        .from(trainingGroupMembers).innerJoin(trainingGroups, eq(trainingGroups.id, trainingGroupMembers.groupId))
        .where(and(eq(trainingGroupMembers.userId, operatorId), eq(trainingGroups.status, "active")));
      if (!assignment || assignment.type !== "card_action" ||
        !isAssignedToOperator(assignment, operatorId, memberships)) this.unavailable();
      if (assignment.cardSource !== "generated" && assignment.cardSource !== "ticket") {
        throw new AppBadRequestException(ErrorCodes.ASSIGNMENT_NOT_AVAILABLE, "For standalone DDS choose a scenario card, not operator-call delivery");
      }
      const [repeated] = await tx.select({ id: ddsExercises.id }).from(ddsExercises)
        .innerJoin(trainingAttempts, eq(trainingAttempts.id, ddsExercises.trainingAttemptId))
        .where(and(eq(trainingAttempts.assignmentId, assignmentId), eq(ddsExercises.operatorId, operatorId), eq(ddsExercises.startEventId, eventId)));
      if (repeated) return repeated.id;
      const attempts = await tx.select().from(trainingAttempts)
        .where(and(eq(trainingAttempts.assignmentId, assignmentId), eq(trainingAttempts.operatorId, operatorId)));
      // Resume, including after a lost response, before charging another attempt.
      const active = attempts.find((item) => item.status === "active");
      if (active) return active.trainingSessionId;
      const blocker = attemptBlocker(assignment, attempts.length, new Date());
      if (blocker) throw new AppConflictException(blocker, "The DDS assignment cannot start another attempt");
      const [busy] = await tx.select({ id: trainingAttempts.id }).from(trainingAttempts)
        .where(and(eq(trainingAttempts.operatorId, operatorId), inArray(trainingAttempts.status, ["active", "offered"]))).limit(1);
      if (busy) throw new AppConflictException(ErrorCodes.ASSIGNMENT_ATTEMPT_ACTIVE, "Finish the active exercise first");
      const source = await this.store.loadScenarioSource(assignment.scenarioVersionId);
      const card = source ? buildDdsCardSnapshot(source) : null;
      if (!card) throw new AppBadRequestException(ErrorCodes.DDS_SCENARIO_NOT_READY, "This scenario cannot supply a DDS card");
      const now = new Date();
      const id = generateId();
      const attemptId = generateId();
      // Insert atomically: no orphan attempt if snapshot/event persistence fails.
      await tx.insert(trainingAttempts).values({
        id: attemptId, assignmentId, operatorId, trainingSessionId: id,
        attemptNumber: attempts.length + 1, status: "active", startedAt: now,
      });
      await tx.insert(ddsExercises).values({
        id, scenarioVersionId: assignment.scenarioVersionId, operatorId,
        trainingAttemptId: attemptId, addressedService: card.addressedService,
        card: card.snapshot, startEventId: eventId, createdAt: now, updatedAt: now,
        acknowledgementDeadlineAt: new Date(now.getTime() + assignment.answerNormSeconds * 1_000),
        passThreshold: assignment.passThreshold,
      });
      await tx.insert(ddsExerciseEvents).values({
        id: generateId(), exerciseId: id, sequence: 1, eventId, actorId: operatorId,
        fromStatus: null, toStatus: "pending", occurredAt: now,
      });
      return id;
    }).catch((error: unknown) => {
      // Concurrent starts across assignments are guarded by the active-attempt index.
      const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
      if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
        throw new AppConflictException(ErrorCodes.ASSIGNMENT_ATTEMPT_ACTIVE, "The operator already has an active attempt");
      }
      throw error;
    });
    return this.exercises.get(exerciseId, operatorId);
  }

  async list(actor: TrainingActor): Promise<DdsTrainingAttempt[]> {
    const rows = await this.db.select({
      id: ddsExercises.id, operatorId: trainingAttempts.operatorId,
      assignmentId: trainingAssignments.id, assignmentTitle: trainingAssignments.title,
      operatorName: users.fullName, attemptNumber: trainingAttempts.attemptNumber,
      attemptStatus: trainingAttempts.status, passThreshold: ddsExercises.passThreshold,
    }).from(ddsExercises)
      .innerJoin(trainingAttempts, eq(trainingAttempts.id, ddsExercises.trainingAttemptId))
      .innerJoin(trainingAssignments, eq(trainingAssignments.id, trainingAttempts.assignmentId))
      .innerJoin(users, eq(users.id, trainingAttempts.operatorId))
      .leftJoin(trainingGroups, eq(trainingGroups.id, trainingAssignments.groupId))
      .where(this.scope(actor)).orderBy(desc(ddsExercises.createdAt)).limit(200);
    const reviews = rows.length ? await this.db.select().from(ddsExerciseReviews)
      .where(inArray(ddsExerciseReviews.exerciseId, rows.map((row) => row.id)))
      .orderBy(desc(ddsExerciseReviews.createdAt)) : [];
    // Карточки берутся пакетом: запрос на каждую попытку превращал открытие
    // кабинета в сотни запросов.
    const exercises = await this.exercises.presentByIds(rows.map((row) => row.id));
    return rows.flatMap(({ id, ...row }) => {
      const exercise = exercises.get(id);
      if (!exercise) return [];
      return [{
        ...row, exercise,
        reviews: reviews.filter((review) => review.exerciseId === id).map((review) => ({
          eventId: review.eventId, instructorId: review.instructorId, score: review.score,
          comment: review.comment, createdAt: review.createdAt.toISOString(),
        })),
      }];
    });
  }

  async review(actor: TrainingActor, id: string, input: ReviewDdsDto) {
    await this.db.transaction(async (tx) => {
      const exercise = await this.requireManaged(tx, actor, id);
      if (!exercise.completedAt) throw new AppConflictException(ErrorCodes.DDS_STATUS_TRANSITION_INVALID, "Finish or stop the attempt before assessment");
      const [created] = await tx.insert(ddsExerciseReviews).values({
        id: generateId(), exerciseId: id, instructorId: actor.id, ...input,
      }).onConflictDoNothing({ target: [ddsExerciseReviews.exerciseId, ddsExerciseReviews.eventId] }).returning();
      if (created) await this.audit.log({ actorId: actor.id, action: "dds.review.created", resource: "dds-exercise", resourceId: id, details: { score: input.score, eventId: input.eventId } }, tx);
    });
  }

  async stop(actor: TrainingActor, id: string, reason: string) {
    await this.db.transaction(async (tx) => {
      const exercise = await this.requireManaged(tx, actor, id);
      if (exercise.completedAt) return;
      const now = new Date();
      const sequence = exercise.lastSequence + 1;
      await tx.update(ddsExercises).set({ completedAt: now, updatedAt: now, lastSequence: sequence }).where(eq(ddsExercises.id, id));
      // Журнал упражнения должен объяснять закрытие: audit log ученику не виден,
      // а статус остаётся прежним, потому что попытка не завершена по сценарию.
      await tx.insert(ddsExerciseEvents).values({
        id: generateId(), exerciseId: id, sequence, eventId: generateId(),
        actorId: actor.id, fromStatus: exercise.status, toStatus: exercise.status,
        comment: `Остановлено преподавателем: ${reason}`, occurredAt: now,
      });
      await tx.update(trainingAttempts).set({ status: "cancelled_by_instructor", endedAt: now })
        .where(and(eq(trainingAttempts.id, exercise.trainingAttemptId!), eq(trainingAttempts.status, "active")));
      await this.audit.log({ actorId: actor.id, action: "dds.attempt.stopped", resource: "dds-exercise", resourceId: id, details: { reason } }, tx);
    });
  }

  private async requireManaged(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], actor: TrainingActor, id: string) {
    const [row] = await tx.select({ exercise: ddsExercises }).from(ddsExercises)
      .innerJoin(trainingAttempts, eq(trainingAttempts.id, ddsExercises.trainingAttemptId))
      .innerJoin(trainingAssignments, eq(trainingAssignments.id, trainingAttempts.assignmentId))
      .leftJoin(trainingGroups, eq(trainingGroups.id, trainingAssignments.groupId))
      .where(and(eq(ddsExercises.id, id), this.scope(actor))).for("update", { of: ddsExercises });
    if (!row) throw new AppNotFoundException(ErrorCodes.DDS_EXERCISE_NOT_FOUND, "There is no managed DDS attempt with this id");
    return row.exercise;
  }

  private scope(actor: TrainingActor) {
    return actor.role === "admin" ? undefined : or(eq(trainingAssignments.createdBy, actor.id), eq(trainingGroups.instructorId, actor.id));
  }
  private unavailable(): never {
    throw new AppNotFoundException(ErrorCodes.ASSIGNMENT_NOT_AVAILABLE, "There is no DDS assignment available to this learner");
  }
}
