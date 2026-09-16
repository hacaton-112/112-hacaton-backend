import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callerPersonas,
  ddsExerciseEvents,
  ddsExercises,
  referenceCardFields,
  scenarioLocations,
  scenarios,
  scenarioVersions,
} from "@/drizzle/schema";

import type { DdsExerciseEvent } from "../dto/dds-exercise.dto";
import type {
  AppendDdsTransitionInput,
  AppendDdsTransitionOutcome,
  CreateDdsExerciseInput,
  DdsExerciseStore,
  DdsScenarioSource,
  StoredDdsExercise,
} from "../ports/dds-exercise.store.port";

type Database = DrizzleService["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type ExerciseRow = typeof ddsExercises.$inferSelect;
type EventRow = typeof ddsExerciseEvents.$inferSelect;

const eventFromRow = (row: EventRow): DdsExerciseEvent => ({
  sequence: row.sequence,
  eventId: row.eventId,
  fromStatus: row.fromStatus,
  toStatus: row.toStatus,
  comment: row.comment,
  occurredAt: row.occurredAt.toISOString(),
});

const exerciseFromRows = (
  row: ExerciseRow,
  events: readonly EventRow[],
): StoredDdsExercise => ({
  id: row.id,
  scenarioVersionId: row.scenarioVersionId,
  operatorId: row.operatorId,
  trainingAttemptId: row.trainingAttemptId,
  addressedService: row.addressedService,
  status: row.status,
  card: row.card,
  acknowledgementDeadlineAt: row.acknowledgementDeadlineAt,
  acknowledgedAt: row.acknowledgedAt,
  completedAt: row.completedAt,
  lastSequence: row.lastSequence,
  score: row.score,
  passed: row.passed,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  events: events.map(eventFromRow),
});

@Injectable()
export class DrizzleDdsExerciseStore implements DdsExerciseStore {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async loadScenarioSource(
    scenarioVersionId: string,
  ): Promise<DdsScenarioSource | null> {
    const [row] = await this.db
      .select({
        scenarioVersionId: scenarioVersions.id,
        code: scenarios.code,
        title: scenarios.title,
        summary: scenarios.summary,
        category: scenarios.category,
        expectedServices: scenarioVersions.expectedServices,
        exactAddress: scenarioLocations.exactAddress,
        exactLatitude: scenarioLocations.exactLat,
        exactLongitude: scenarioLocations.exactLon,
        locatorLabel: scenarioLocations.locatorLabel,
        callerName: callerPersonas.displayName,
        callerNumber: scenarioLocations.callerNumber,
      })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .innerJoin(
        scenarioLocations,
        eq(scenarioLocations.scenarioVersionId, scenarioVersions.id),
      )
      .innerJoin(
        callerPersonas,
        eq(callerPersonas.id, scenarioVersions.personaId),
      )
      .where(
        and(
          eq(scenarioVersions.id, scenarioVersionId),
          eq(scenarios.status, "published"),
          isNotNull(scenarioVersions.publishedAt),
        ),
      )
      .limit(1);

    if (!row) return null;

    const fields = await this.db
      .select({
        field: referenceCardFields.field,
        expectedValue: referenceCardFields.expectedValue,
      })
      .from(referenceCardFields)
      .where(eq(referenceCardFields.scenarioVersionId, scenarioVersionId));

    return {
      ...row,
      exactLatitude: Number(row.exactLatitude),
      exactLongitude: Number(row.exactLongitude),
      referenceFields: fields,
    };
  }

  async findStartedByEvent(
    operatorId: string,
    startEventId: string,
  ): Promise<StoredDdsExercise | null> {
    const [row] = await this.db
      .select()
      .from(ddsExercises)
      .where(
        and(
          eq(ddsExercises.operatorId, operatorId),
          eq(ddsExercises.startEventId, startEventId),
        ),
      )
      .limit(1);

    return row ? this.withEvents(row) : null;
  }

  async findOwnByTransitionEvent(
    exerciseId: string,
    operatorId: string,
    eventId: string,
  ): Promise<StoredDdsExercise | null> {
    const [row] = await this.db
      .select({ exercise: ddsExercises })
      .from(ddsExerciseEvents)
      .innerJoin(
        ddsExercises,
        eq(ddsExercises.id, ddsExerciseEvents.exerciseId),
      )
      .where(
        and(
          eq(ddsExerciseEvents.exerciseId, exerciseId),
          eq(ddsExerciseEvents.eventId, eventId),
          eq(ddsExercises.operatorId, operatorId),
        ),
      )
      .limit(1);

    return row ? this.withEvents(row.exercise) : null;
  }

  create(input: CreateDdsExerciseInput): Promise<StoredDdsExercise> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(ddsExercises)
        .values({
          id: input.id,
          scenarioVersionId: input.scenarioVersionId,
          operatorId: input.operatorId,
          addressedService: input.addressedService,
          card: input.card,
          acknowledgementDeadlineAt: input.acknowledgementDeadlineAt,
          startEventId: input.startEventId,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        })
        .onConflictDoNothing({
          target: [ddsExercises.operatorId, ddsExercises.startEventId],
        })
        .returning();

      if (!created) {
        const [existing] = await tx
          .select()
          .from(ddsExercises)
          .where(
            and(
              eq(ddsExercises.operatorId, input.operatorId),
              eq(ddsExercises.startEventId, input.startEventId),
            ),
          )
          .limit(1);

        if (!existing) {
          throw new Error("DDS exercise start conflict was not readable");
        }

        return this.withEventsInTransaction(tx, existing);
      }

      await tx.insert(ddsExerciseEvents).values({
        id: generateId(),
        exerciseId: created.id,
        sequence: 1,
        eventId: input.startEventId,
        fromStatus: null,
        toStatus: "pending",
        actorId: input.operatorId,
        occurredAt: input.createdAt,
      });

      return this.withEventsInTransaction(tx, created);
    });
  }

  async listByOperator(
    operatorId: string,
  ): Promise<readonly StoredDdsExercise[]> {
    const rows = await this.db
      .select()
      .from(ddsExercises)
      .where(eq(ddsExercises.operatorId, operatorId))
      .orderBy(desc(ddsExercises.createdAt));

    return Promise.all(rows.map((row) => this.withEvents(row)));
  }

  async loadOwn(
    exerciseId: string,
    operatorId: string,
  ): Promise<StoredDdsExercise | null> {
    const [row] = await this.db
      .select()
      .from(ddsExercises)
      .where(
        and(
          eq(ddsExercises.id, exerciseId),
          eq(ddsExercises.operatorId, operatorId),
        ),
      )
      .limit(1);

    return row ? this.withEvents(row) : null;
  }

  appendTransition(
    input: AppendDdsTransitionInput,
  ): Promise<AppendDdsTransitionOutcome> {
    return this.db.transaction(async (tx) => {
      const [repeated] = await tx
        .select({ id: ddsExerciseEvents.id })
        .from(ddsExerciseEvents)
        .where(
          and(
            eq(ddsExerciseEvents.exerciseId, input.exerciseId),
            eq(ddsExerciseEvents.eventId, input.eventId),
          ),
        )
        .limit(1);

      if (repeated) {
        const existing = await this.loadOwnInTransaction(
          tx,
          input.exerciseId,
          input.operatorId,
        );

        return existing
          ? { kind: "duplicate", exercise: existing }
          : { kind: "stale" };
      }

      const [updated] = await tx
        .update(ddsExercises)
        .set({
          status: input.nextStatus,
          lastSequence: input.expectedSequence + 1,
          updatedAt: input.occurredAt,
          ...(input.acknowledgedAt
            ? { acknowledgedAt: input.acknowledgedAt }
            : {}),
          ...(input.completedAt ? { completedAt: input.completedAt } : {}),
          ...(input.score === undefined ? {} : { score: input.score }),
          ...(input.passed === undefined ? {} : { passed: input.passed }),
        })
        .where(
          and(
            eq(ddsExercises.id, input.exerciseId),
            eq(ddsExercises.operatorId, input.operatorId),
            eq(ddsExercises.status, input.expectedStatus),
            eq(ddsExercises.lastSequence, input.expectedSequence),
          ),
        )
        .returning();

      if (!updated) return { kind: "stale" };

      await tx.insert(ddsExerciseEvents).values({
        id: generateId(),
        exerciseId: input.exerciseId,
        sequence: input.expectedSequence + 1,
        eventId: input.eventId,
        fromStatus: input.expectedStatus,
        toStatus: input.nextStatus,
        actorId: input.operatorId,
        comment: input.comment,
        occurredAt: input.occurredAt,
      });

      return {
        kind: "updated",
        exercise: await this.withEventsInTransaction(tx, updated),
      };
    });
  }

  private async withEvents(row: ExerciseRow): Promise<StoredDdsExercise> {
    const events = await this.db
      .select()
      .from(ddsExerciseEvents)
      .where(eq(ddsExerciseEvents.exerciseId, row.id))
      .orderBy(asc(ddsExerciseEvents.sequence));

    return exerciseFromRows(row, events);
  }

  private async withEventsInTransaction(
    tx: Transaction,
    row: ExerciseRow,
  ): Promise<StoredDdsExercise> {
    const events = await tx
      .select()
      .from(ddsExerciseEvents)
      .where(eq(ddsExerciseEvents.exerciseId, row.id))
      .orderBy(asc(ddsExerciseEvents.sequence));

    return exerciseFromRows(row, events);
  }

  private async loadOwnInTransaction(
    tx: Transaction,
    exerciseId: string,
    operatorId: string,
  ): Promise<StoredDdsExercise | null> {
    const [row] = await tx
      .select()
      .from(ddsExercises)
      .where(
        and(
          eq(ddsExercises.id, exerciseId),
          eq(ddsExercises.operatorId, operatorId),
        ),
      )
      .limit(1);

    return row ? this.withEventsInTransaction(tx, row) : null;
  }
}
