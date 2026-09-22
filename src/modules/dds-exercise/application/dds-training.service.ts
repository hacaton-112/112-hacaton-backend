import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, or } from "drizzle-orm";
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
import { attemptBlocker, isAssignedToOperator, TrainingService, type TrainingActor } from "@/modules/training/training.service";
import { buildDdsCardSnapshot } from "../domain/dds-card-snapshot";
import {
  DDS_EXERCISE_STORE,
  type DdsExerciseStore,
  type StoredCrewHandoff,
} from "../ports/dds-exercise.store.port";
import { ddsLiveFindings } from "../domain/dds-live-findings";
import type { DdsLiveList, DdsTrainingList, ReviewDdsDto } from "../dto/dds-training.dto";
import {
  DDS_CREW_HANDOFF_REQUIRED,
  DdsExerciseService,
  handoffFacts,
} from "./dds-exercise.service";

type Database = DrizzleService["db"];

/** Assignment orchestration only; card transitions and assessment stay in DDS domain. */
@Injectable()
export class DdsTrainingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(DDS_EXERCISE_STORE) private readonly store: DdsExerciseStore,
    private readonly exercises: DdsExerciseService,
    private readonly audit: AuditLogService,
    @Inject(DDS_CREW_HANDOFF_REQUIRED)
    private readonly handoffRequired: boolean,
    private readonly training: TrainingService,
  ) {}

  /**
   * Идущие карточные попытки для мониторинга.
   *
   * Преподаватель сидит на одном месте, поэтому ему нужны не результаты, а
   * текущее состояние: сколько осталось от норматива и что уже пошло не так.
   * Наблюдения не являются оценкой: её считает завершение попытки.
   */
  async live(actor: TrainingActor): Promise<DdsLiveList> {
    const rows = await this.db.select({
      id: ddsExercises.id, assignmentId: trainingAssignments.id,
      assignmentTitle: trainingAssignments.title,
      operatorId: trainingAttempts.operatorId, operatorName: users.fullName,
      attemptNumber: trainingAttempts.attemptNumber, startedAt: trainingAttempts.startedAt,
      status: ddsExercises.status, addressedService: ddsExercises.addressedService,
      card: ddsExercises.card,
      acknowledgementDeadlineAt: ddsExercises.acknowledgementDeadlineAt,
      acknowledgedAt: ddsExercises.acknowledgedAt,
    }).from(ddsExercises)
      .innerJoin(trainingAttempts, eq(trainingAttempts.id, ddsExercises.trainingAttemptId))
      .innerJoin(trainingAssignments, eq(trainingAssignments.id, trainingAttempts.assignmentId))
      .innerJoin(users, eq(users.id, trainingAttempts.operatorId))
      .leftJoin(trainingGroups, eq(trainingGroups.id, trainingAssignments.groupId))
      .where(and(
        eq(trainingAttempts.status, "active"),
        isNull(ddsExercises.completedAt),
        this.scope(actor),
      ))
      .orderBy(asc(ddsExercises.acknowledgementDeadlineAt)).limit(50);
    // Карточка из очереди смены попытки не имеет, но работа по ней такая же
    // идущая: отсчёт норматива и наблюдения нужны преподавателю и здесь.
    // Владелец появляется в момент, когда диспетчер её принял.
    const standaloneRows = await this.db.select({
      id: ddsExercises.id, operatorId: users.id, operatorName: users.fullName,
      startedAt: ddsExercises.createdAt, status: ddsExercises.status,
      addressedService: ddsExercises.addressedService, card: ddsExercises.card,
      acknowledgementDeadlineAt: ddsExercises.acknowledgementDeadlineAt,
      acknowledgedAt: ddsExercises.acknowledgedAt,
    }).from(ddsExercises)
      .innerJoin(users, eq(users.id, ddsExercises.operatorId))
      .where(and(
        isNull(ddsExercises.trainingAttemptId),
        isNull(ddsExercises.completedAt),
        this.standaloneScope(actor),
      ))
      .orderBy(asc(ddsExercises.acknowledgementDeadlineAt)).limit(50);
    // Звонки наряду подгружаются одним запросом и только когда телефония включена.
    const ids = [...rows, ...standaloneRows].map((row) => row.id);
    const handoffs = this.handoffRequired && ids.length
      ? await this.store.loadCrewHandoffs(await this.store.listByIds(ids))
      : new Map<string, StoredCrewHandoff>();
    const now = new Date();
    const observed = (row: {
      id: string;
      acknowledgementDeadlineAt: Date;
      acknowledgedAt: Date | null;
    }) => {
      const handoff = handoffs.get(row.id);

      return ddsLiveFindings({
        acknowledgementDeadlineAt: row.acknowledgementDeadlineAt,
        acknowledgedAt: row.acknowledgedAt,
        ...(handoff ? { handoff: handoffFacts(handoff) } : {}),
        now,
      });
    };

    return {
      attempts: rows.map((row) => ({
        exerciseId: row.id,
        assignmentId: row.assignmentId,
        assignmentTitle: row.assignmentTitle,
        operatorId: row.operatorId,
        operatorName: row.operatorName,
        attemptNumber: row.attemptNumber,
        startedAt: row.startedAt.toISOString(),
        addressedService: row.addressedService,
        cardTitle: row.card.title,
        status: row.status,
        acknowledgementDeadlineAt: row.acknowledgementDeadlineAt.toISOString(),
        acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
        findings: observed(row),
      })),
      standaloneAttempts: standaloneRows.map((row) => ({
        exerciseId: row.id,
        operatorId: row.operatorId,
        operatorName: row.operatorName,
        startedAt: row.startedAt.toISOString(),
        addressedService: row.addressedService,
        cardTitle: row.card.title,
        status: row.status,
        acknowledgementDeadlineAt: row.acknowledgementDeadlineAt.toISOString(),
        acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
        findings: observed(row),
      })),
    };
  }

  async start(operatorId: string, assignmentId: string, eventId: string) {
    // A voice call may have been closed by the janitor after its gateway was
    // lost. Such an attempt is no longer active and must not block DDS.
    await this.training.reconcileOperatorAttempts(operatorId);
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

  async list(actor: TrainingActor): Promise<DdsTrainingList> {
    const assignedRows = await this.db.select({
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

    const standaloneRows = await this.db.select({
      id: ddsExercises.id, operatorId: users.id,
      operatorName: users.fullName, passThreshold: ddsExercises.passThreshold,
    }).from(ddsExercises)
      .innerJoin(users, eq(users.id, ddsExercises.operatorId))
      .where(and(
        isNull(ddsExercises.trainingAttemptId),
        isNotNull(ddsExercises.completedAt),
        this.standaloneScope(actor),
      ))
      .orderBy(desc(ddsExercises.createdAt)).limit(200);

    const reviews = assignedRows.length ? await this.db.select().from(ddsExerciseReviews)
      .where(inArray(ddsExerciseReviews.exerciseId, assignedRows.map((row) => row.id)))
      .orderBy(desc(ddsExerciseReviews.createdAt)) : [];
    // Карточки берутся пакетом: запрос на каждую попытку превращал открытие
    // кабинета в сотни запросов.
    const exercises = await this.exercises.presentByIds([
      ...assignedRows.map((row) => row.id),
      ...standaloneRows.map((row) => row.id),
    ]);
    const attempts = assignedRows.flatMap(({ id, ...row }) => {
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
    const standaloneResults = standaloneRows.flatMap(({ id, ...row }) => {
      const exercise = exercises.get(id);
      return exercise ? [{ ...row, exercise }] : [];
    });
    return { attempts, standaloneResults };
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

  /** Карточку очереди смены видит тот, кто ведёт группу этого диспетчера. */
  private standaloneScope(actor: TrainingActor) {
    if (actor.role === "admin") return undefined;

    return exists(
      this.db.select({ userId: trainingGroupMembers.userId })
        .from(trainingGroupMembers)
        .innerJoin(trainingGroups, eq(trainingGroups.id, trainingGroupMembers.groupId))
        .where(and(
          eq(trainingGroupMembers.userId, ddsExercises.operatorId),
          eq(trainingGroups.instructorId, actor.id),
        )),
    );
  }

  private unavailable(): never {
    throw new AppNotFoundException(ErrorCodes.ASSIGNMENT_NOT_AVAILABLE, "There is no DDS assignment available to this learner");
  }
}
