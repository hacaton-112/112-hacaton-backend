import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import {
  AppBadRequestException,
  AppNotFoundException,
} from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  ddsExerciseEvents,
  ddsExercises,
  ddsLessons,
  scenarios,
  scenarioVersions,
  trainingGroupMembers,
  trainingGroups,
  users,
  type DdsLessonCardSource,
  type DdsLessonRecord,
  type DispatchService,
} from "@/drizzle/schema";
import { AuditLogService } from "@/modules/audit-log/application/audit-log.service";
import type { TrainingActor } from "@/modules/training/application/training.service";

import { buildDdsCardSnapshot } from "../domain/dds-card-snapshot";
import { normalizeDdsServiceTag } from "../domain/dds-service-access";
import type {
  CreateDdsLesson,
  DdsLesson,
  DdsLessonSummary,
  NextDdsLessonCardResponse,
} from "../dto/dds-lesson.dto";
import {
  DDS_EXERCISE_STORE,
  type DdsExerciseStore,
} from "../ports/dds-exercise.store.port";
import { DdsExerciseService } from "./dds-exercise.service";
import { DdsInsightsService } from "./dds-insights.service";

type Database = DrizzleService["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type LessonSource = Exclude<DdsLessonCardSource, "mixed">;

const sourceOf = (card: {
  sourceTrainingSessionId: string | null;
}): LessonSource =>
  card.sourceTrainingSessionId === null ? "generated" : "operator_call";

/** Случайный порядок без ORDER BY random(): версии уже отобраны в памяти. */
const shuffle = <T>(items: T[]): T[] => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
};

/** Поток карточек одного практического занятия ДДС. */
@Injectable()
export class DdsLessonService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(DDS_EXERCISE_STORE) private readonly store: DdsExerciseStore,
    private readonly exercises: DdsExerciseService,
    private readonly audit: AuditLogService,
    @Optional() private readonly insights?: DdsInsightsService,
  ) {}

  async create(
    actor: TrainingActor,
    input: CreateDdsLesson,
  ): Promise<DdsLesson> {
    const [repeated] = await this.db
      .select()
      .from(ddsLessons)
      .where(
        and(
          eq(ddsLessons.createdBy, actor.id),
          eq(ddsLessons.startEventId, input.eventId),
        ),
      )
      .limit(1);
    if (repeated) return this.presentOne(repeated);

    await this.validateTarget(actor, input.groupId, input.targetUserId);
    const now = new Date();
    const [created] = await this.db
      .insert(ddsLessons)
      .values({
        id: generateId(),
        createdBy: actor.id,
        groupId: input.groupId ?? null,
        targetUserId: input.targetUserId ?? null,
        title: input.title,
        categories: [...new Set(input.categories)],
        cardSource: input.cardSource,
        acknowledgementNormSeconds: input.acknowledgementNormSeconds,
        passThreshold: input.passThreshold,
        status: "active",
        startEventId: input.eventId,
        startedAt: now,
      })
      .onConflictDoNothing({
        target: [ddsLessons.createdBy, ddsLessons.startEventId],
      })
      .returning();
    const lesson =
      created ??
      (
        await this.db
          .select()
          .from(ddsLessons)
          .where(
            and(
              eq(ddsLessons.createdBy, actor.id),
              eq(ddsLessons.startEventId, input.eventId),
            ),
          )
          .limit(1)
      )[0];
    if (!lesson)
      throw new Error("DDS lesson creation conflict was not readable");

    await this.audit.log({
      actorId: actor.id,
      action: "dds.lesson.started",
      resource: "dds-lesson",
      resourceId: lesson.id,
      details: { cardSource: lesson.cardSource, categories: lesson.categories },
    });
    return this.presentOne(lesson);
  }

  async next(
    operatorId: string,
    lessonId: string,
    eventId: string,
  ): Promise<NextDdsLessonCardResponse> {
    const outcome = await this.db.transaction(async (tx) => {
      const [lesson] = await tx
        .select()
        .from(ddsLessons)
        .where(eq(ddsLessons.id, lessonId))
        .for("update");
      if (!lesson) this.notFound();
      const service = await this.requireAddressedOperator(
        tx,
        lesson,
        operatorId,
      );
      if (lesson.status !== "active") {
        return {
          kind: "empty" as const,
          reason: "Занятие завершено преподавателем",
        };
      }

      const [repeated] = await tx
        .select({ id: ddsExercises.id })
        .from(ddsExercises)
        .where(
          and(
            eq(ddsExercises.lessonId, lesson.id),
            eq(ddsExercises.operatorId, operatorId),
            eq(ddsExercises.startEventId, eventId),
          ),
        )
        .limit(1);
      if (repeated) return { kind: "ready" as const, id: repeated.id };

      const [active] = await tx
        .select({ id: ddsExercises.id })
        .from(ddsExercises)
        .where(
          and(
            eq(ddsExercises.lessonId, lesson.id),
            eq(ddsExercises.operatorId, operatorId),
            isNull(ddsExercises.completedAt),
          ),
        )
        .limit(1);
      if (active) return { kind: "ready" as const, id: active.id };

      const preferred = await this.preferredSource(tx, lesson, operatorId);
      const sources: readonly LessonSource[] =
        lesson.cardSource === "mixed"
          ? [
              preferred,
              preferred === "generated" ? "operator_call" : "generated",
            ]
          : [lesson.cardSource];
      for (const source of sources) {
        const id =
          source === "generated"
            ? await this.issueGenerated(
                tx,
                lesson,
                operatorId,
                service,
                eventId,
              )
            : await this.claimOperatorCard(
                tx,
                lesson,
                operatorId,
                service,
                eventId,
              );
        if (id) return { kind: "ready" as const, id };
      }
      return {
        kind: "empty" as const,
        reason: "Подходящих карточек пока нет. Ожидайте поступления в очередь.",
      };
    });

    if (outcome.kind === "empty") {
      return { status: "empty", reason: outcome.reason };
    }
    const exercise = (await this.exercises.presentByIds([outcome.id])).get(
      outcome.id,
    );
    if (!exercise) throw new Error("Issued DDS lesson card was not readable");
    return { status: "ready", exercise };
  }

  async finish(
    actor: TrainingActor,
    lessonId: string,
    eventId: string,
  ): Promise<DdsLesson> {
    const lesson = await this.db.transaction(async (tx) => {
      const managed = await this.requireManaged(tx, actor, lessonId);
      if (managed.status === "finished") return managed;
      const now = new Date();
      const open = await tx
        .select()
        .from(ddsExercises)
        .where(
          and(
            eq(ddsExercises.lessonId, lessonId),
            isNull(ddsExercises.completedAt),
          ),
        )
        .for("update");
      for (const exercise of open) {
        const sequence = exercise.lastSequence + 1;
        await tx
          .update(ddsExercises)
          .set({
            status: "lesson_finished",
            completedAt: now,
            updatedAt: now,
            lastSequence: sequence,
            score: null,
            passed: null,
          })
          .where(eq(ddsExercises.id, exercise.id));
        await tx.insert(ddsExerciseEvents).values({
          id: generateId(),
          exerciseId: exercise.id,
          sequence,
          eventId,
          actorId: actor.id,
          fromStatus: exercise.status,
          toStatus: "lesson_finished",
          comment: "Занятие завершено преподавателем",
          occurredAt: now,
        });
      }
      const [finished] = await tx
        .update(ddsLessons)
        .set({
          status: "finished",
          finishEventId: eventId,
          finishedAt: now,
          finishedBy: actor.id,
        })
        .where(eq(ddsLessons.id, lessonId))
        .returning();
      await this.audit.log(
        {
          actorId: actor.id,
          action: "dds.lesson.finished",
          resource: "dds-lesson",
          resourceId: lessonId,
          details: { eventId, closedCards: open.length },
        },
        tx,
      );
      return finished!;
    });
    await this.insights?.enqueue(lesson.id);
    return this.presentOne(lesson);
  }

  async list(actor: TrainingActor): Promise<{ lessons: DdsLesson[] }> {
    const rows = await this.db
      .select({ lesson: ddsLessons })
      .from(ddsLessons)
      .leftJoin(trainingGroups, eq(trainingGroups.id, ddsLessons.groupId))
      .where(this.managedScope(actor))
      .orderBy(desc(ddsLessons.startedAt));
    return {
      lessons: await Promise.all(
        rows.map(({ lesson }) => this.presentOne(lesson)),
      ),
    };
  }

  async get(actor: TrainingActor, lessonId: string): Promise<DdsLesson> {
    const rows = await this.db
      .select({ lesson: ddsLessons })
      .from(ddsLessons)
      .leftJoin(trainingGroups, eq(trainingGroups.id, ddsLessons.groupId))
      .where(and(eq(ddsLessons.id, lessonId), this.managedScope(actor)))
      .limit(1);
    if (!rows[0]) this.notFound();
    return this.presentOne(rows[0].lesson);
  }

  async myActive(operatorId: string): Promise<{ lessons: DdsLessonSummary[] }> {
    const memberships = await this.db
      .select({
        groupId: trainingGroupMembers.groupId,
        serviceTag: trainingGroupMembers.serviceTag,
      })
      .from(trainingGroupMembers)
      .innerJoin(
        trainingGroups,
        eq(trainingGroups.id, trainingGroupMembers.groupId),
      )
      .where(
        and(
          eq(trainingGroupMembers.userId, operatorId),
          eq(trainingGroups.status, "active"),
        ),
      );
    const groupIds = memberships
      .filter(({ serviceTag }) => normalizeDdsServiceTag(serviceTag) !== null)
      .map(({ groupId }) => groupId);
    const rows = await this.db
      .select()
      .from(ddsLessons)
      .where(
        and(
          eq(ddsLessons.status, "active"),
          groupIds.length === 0
            ? eq(ddsLessons.targetUserId, operatorId)
            : or(
                eq(ddsLessons.targetUserId, operatorId),
                inArray(ddsLessons.groupId, groupIds),
              ),
        ),
      )
      .orderBy(desc(ddsLessons.startedAt));
    return { lessons: rows.map((row) => this.summary(row)) };
  }

  private async preferredSource(
    tx: Transaction,
    lesson: DdsLessonRecord,
    operatorId: string,
  ): Promise<LessonSource> {
    if (lesson.cardSource !== "mixed") return lesson.cardSource;
    const [last] = await tx
      .select({ sourceTrainingSessionId: ddsExercises.sourceTrainingSessionId })
      .from(ddsExercises)
      .where(
        and(
          eq(ddsExercises.lessonId, lesson.id),
          eq(ddsExercises.operatorId, operatorId),
        ),
      )
      .orderBy(desc(ddsExercises.updatedAt))
      .limit(1);
    if (!last) return "generated";
    return sourceOf(last) === "generated" ? "operator_call" : "generated";
  }

  private async issueGenerated(
    tx: Transaction,
    lesson: DdsLessonRecord,
    operatorId: string,
    service: DispatchService,
    eventId: string,
  ): Promise<string | null> {
    const used = await tx
      .select({ id: ddsExercises.scenarioVersionId })
      .from(ddsExercises)
      .where(
        and(
          eq(ddsExercises.lessonId, lesson.id),
          isNull(ddsExercises.sourceTrainingSessionId),
        ),
      );
    const usedIds = new Set(used.map(({ id }) => id));
    const versions = await tx
      .select({
        id: scenarioVersions.id,
        scenarioId: scenarioVersions.scenarioId,
      })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarios.id, scenarioVersions.scenarioId))
      .where(
        and(
          eq(scenarios.status, "published"),
          isNotNull(scenarioVersions.publishedAt),
          inArray(scenarios.category, lesson.categories),
        ),
      )
      .orderBy(desc(scenarioVersions.version));
    // Только действующая версия сценария, как в каталоге: прошлые версии
    // остаются за проведёнными звонками и в новое занятие не попадают.
    const current = new Map<string, string>();
    for (const version of versions) {
      if (!current.has(version.scenarioId)) {
        current.set(version.scenarioId, version.id);
      }
    }
    const candidates = shuffle([...current.values()]);
    const ordered = [
      ...candidates.filter((id) => !usedIds.has(id)),
      ...candidates.filter((id) => usedIds.has(id)),
    ];
    for (const candidateId of ordered) {
      const source = await this.store.loadScenarioSource(candidateId);
      if (!source) continue;
      const built = buildDdsCardSnapshot(source);
      // В ленту службы попадают только её происшествия: газовой службе не
      // выдаётся приступ астмы только потому, что так выпал случай.
      if (!built?.snapshot.services.includes(service)) continue;
      const now = new Date();
      const id = generateId();
      await tx.insert(ddsExercises).values({
        id,
        scenarioVersionId: candidateId,
        operatorId,
        lessonId: lesson.id,
        addressedService: service,
        card: built.snapshot,
        startEventId: eventId,
        acknowledgementDeadlineAt: new Date(
          now.getTime() + lesson.acknowledgementNormSeconds * 1_000,
        ),
        passThreshold: lesson.passThreshold,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(ddsExerciseEvents).values({
        id: generateId(),
        exerciseId: id,
        sequence: 1,
        eventId,
        actorId: operatorId,
        fromStatus: null,
        toStatus: "pending",
        occurredAt: now,
      });
      return id;
    }
    return null;
  }

  private async claimOperatorCard(
    tx: Transaction,
    lesson: DdsLessonRecord,
    operatorId: string,
    service: DispatchService,
    eventId: string,
  ): Promise<string | null> {
    const [candidate] = await tx
      .select()
      .from(ddsExercises)
      .where(
        and(
          isNull(ddsExercises.lessonId),
          isNull(ddsExercises.operatorId),
          isNull(ddsExercises.trainingAttemptId),
          isNotNull(ddsExercises.sourceTrainingSessionId),
          isNull(ddsExercises.completedAt),
          eq(ddsExercises.status, "pending"),
          eq(ddsExercises.addressedService, service),
          // Снимок всегда содержит категорию из фиксированного справочника,
          // поэтому здесь фильтр надёжен и не требует угадывать по свободному тексту.
          inArray(
            sql<string>`${ddsExercises.card} ->> 'category'`,
            lesson.categories,
          ),
        ),
      )
      .orderBy(asc(ddsExercises.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return null;
    const now = new Date();
    const sequence = candidate.lastSequence + 1;
    const [claimed] = await tx
      .update(ddsExercises)
      .set({
        lessonId: lesson.id,
        operatorId,
        startEventId: eventId,
        acknowledgementDeadlineAt: new Date(
          now.getTime() + lesson.acknowledgementNormSeconds * 1_000,
        ),
        passThreshold: lesson.passThreshold,
        lastSequence: sequence,
        updatedAt: now,
      })
      .where(
        and(
          eq(ddsExercises.id, candidate.id),
          isNull(ddsExercises.lessonId),
          isNull(ddsExercises.operatorId),
        ),
      )
      .returning({ id: ddsExercises.id });
    if (!claimed) return null;
    await tx.insert(ddsExerciseEvents).values({
      id: generateId(),
      exerciseId: candidate.id,
      sequence,
      eventId,
      actorId: operatorId,
      fromStatus: "pending",
      toStatus: "pending",
      comment: "Карточка выдана в занятии ДДС",
      occurredAt: now,
    });
    return candidate.id;
  }

  private async requireAddressedOperator(
    tx: Transaction,
    lesson: DdsLessonRecord,
    operatorId: string,
  ): Promise<DispatchService> {
    if (lesson.targetUserId !== null && lesson.targetUserId !== operatorId) {
      this.notFound();
    }
    const memberships = await tx
      .select({
        groupId: trainingGroupMembers.groupId,
        serviceTag: trainingGroupMembers.serviceTag,
      })
      .from(trainingGroupMembers)
      .innerJoin(
        trainingGroups,
        eq(trainingGroups.id, trainingGroupMembers.groupId),
      )
      .where(
        and(
          eq(trainingGroupMembers.userId, operatorId),
          eq(trainingGroups.status, "active"),
          lesson.groupId === null
            ? undefined
            : eq(trainingGroupMembers.groupId, lesson.groupId),
        ),
      );
    if (lesson.groupId !== null && memberships.length === 0) this.notFound();
    const services = [
      ...new Set(
        memberships
          .map(({ serviceTag }) => normalizeDdsServiceTag(serviceTag))
          .filter((value): value is DispatchService => value !== null),
      ),
    ];
    if (services.length !== 1) {
      throw new AppBadRequestException(
        ErrorCodes.DDS_LESSON_SERVICE_INVALID,
        "У ученика должна быть ровно одна распознанная служба ДДС",
      );
    }
    return services[0]!;
  }

  private async validateTarget(
    actor: TrainingActor,
    groupId: string | undefined,
    targetUserId: string | undefined,
  ): Promise<void> {
    if (groupId) {
      const [group] = await this.db
        .select()
        .from(trainingGroups)
        .where(eq(trainingGroups.id, groupId))
        .limit(1);
      if (
        !group ||
        group.status !== "active" ||
        (actor.role !== "admin" && group.instructorId !== actor.id)
      ) {
        this.notFound();
      }
      return;
    }
    const [operator] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, targetUserId!),
          eq(users.role, "operator"),
          eq(users.isActive, true),
        ),
      )
      .limit(1);
    if (!operator) this.notFound();
    await this.db.transaction((tx) =>
      this.requireAddressedOperator(
        tx,
        {
          groupId: null,
          targetUserId: targetUserId!,
        } as DdsLessonRecord,
        targetUserId!,
      ),
    );
  }

  private async requireManaged(
    tx: Transaction,
    actor: TrainingActor,
    lessonId: string,
  ): Promise<DdsLessonRecord> {
    const [row] = await tx
      .select({ lesson: ddsLessons })
      .from(ddsLessons)
      .leftJoin(trainingGroups, eq(trainingGroups.id, ddsLessons.groupId))
      .where(and(eq(ddsLessons.id, lessonId), this.managedScope(actor)))
      .for("update", { of: ddsLessons });
    if (!row) this.notFound();
    return row.lesson;
  }

  private managedScope(actor: TrainingActor) {
    return actor.role === "admin"
      ? undefined
      : or(
          eq(ddsLessons.createdBy, actor.id),
          eq(trainingGroups.instructorId, actor.id),
        );
  }

  private async presentOne(lesson: DdsLessonRecord): Promise<DdsLesson> {
    const participantRows = lesson.groupId
      ? await this.db
          .select({
            userId: users.id,
            fullName: users.fullName,
            serviceTag: trainingGroupMembers.serviceTag,
          })
          .from(trainingGroupMembers)
          .innerJoin(users, eq(users.id, trainingGroupMembers.userId))
          .where(eq(trainingGroupMembers.groupId, lesson.groupId))
          .orderBy(asc(users.fullName))
      : await this.db
          .select({
            userId: users.id,
            fullName: users.fullName,
            serviceTag: trainingGroupMembers.serviceTag,
          })
          .from(users)
          .innerJoin(
            trainingGroupMembers,
            eq(trainingGroupMembers.userId, users.id),
          )
          .innerJoin(
            trainingGroups,
            eq(trainingGroups.id, trainingGroupMembers.groupId),
          )
          .where(
            and(
              eq(users.id, lesson.targetUserId!),
              eq(trainingGroups.status, "active"),
            ),
          )
          .limit(1);
    const cardRows = await this.db
      .select({
        id: ddsExercises.id,
        operatorId: users.id,
        operatorName: users.fullName,
      })
      .from(ddsExercises)
      .innerJoin(users, eq(users.id, ddsExercises.operatorId))
      .where(eq(ddsExercises.lessonId, lesson.id))
      .orderBy(asc(ddsExercises.createdAt));
    const exercises = await this.exercises.presentByIds(
      cardRows.map(({ id }) => id),
    );
    return {
      ...this.summary(lesson),
      participants: participantRows.flatMap((participant) => {
        const service = participant.serviceTag
          ? normalizeDdsServiceTag(participant.serviceTag)
          : null;
        return service
          ? [
              {
                userId: participant.userId,
                fullName: participant.fullName,
                service,
              },
            ]
          : [];
      }),
      skippedParticipants: participantRows.flatMap((participant) =>
        participant.serviceTag &&
        normalizeDdsServiceTag(participant.serviceTag) !== null
          ? []
          : [
              {
                userId: participant.userId,
                fullName: participant.fullName,
                serviceTag: participant.serviceTag,
                reason: "Тег участника не соответствует службе ДДС",
              },
            ],
      ),
      cards: cardRows.flatMap(({ id, operatorId, operatorName }) => {
        const exercise = exercises.get(id);
        return exercise ? [{ operatorId, operatorName, exercise }] : [];
      }),
    };
  }

  private summary(lesson: DdsLessonRecord): DdsLessonSummary {
    return {
      id: lesson.id,
      createdBy: lesson.createdBy,
      groupId: lesson.groupId,
      targetUserId: lesson.targetUserId,
      title: lesson.title,
      categories: lesson.categories,
      cardSource: lesson.cardSource,
      acknowledgementNormSeconds: lesson.acknowledgementNormSeconds,
      passThreshold: lesson.passThreshold,
      status: lesson.status,
      startedAt: lesson.startedAt.toISOString(),
      finishedAt: lesson.finishedAt?.toISOString() ?? null,
      finishedBy: lesson.finishedBy,
    };
  }

  private notFound(): never {
    throw new AppNotFoundException(
      ErrorCodes.DDS_LESSON_NOT_FOUND,
      "Занятие ДДС недоступно",
    );
  }
}
