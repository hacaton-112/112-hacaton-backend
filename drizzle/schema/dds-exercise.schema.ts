import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import type { DdsCardSnapshot } from "@/modules/dds-exercise/dto/dds-exercise.dto";
import { DDS_RESPONSE_STATUSES } from "@/modules/dds-exercise/domain/dds-response-status";

import { dispatchService, incidentCards } from "./incident-card.schema";
import { scenarioVersions } from "./scenario.schema";
import { users } from "./user.schema";

export const ddsResponseStatus = pgEnum(
  "dds_response_status",
  DDS_RESPONSE_STATUSES,
);

/**
 * Current projection of one DDS card-response exercise.
 *
 * It deliberately does not reference `call_states`: receiving a prepared card
 * is a separate practical exercise, not a synthetic phone call. The nullable
 * training attempt id is the integration seam for the assignments module.
 */
export const ddsExercises = pgTable(
  "dds_exercises",
  {
    id: text("id").primaryKey(),
    scenarioVersionId: text("scenario_version_id")
      .notNull()
      .references(() => scenarioVersions.id, { onDelete: "restrict" }),
    operatorId: text("operator_id").references(() => users.id, {
      onDelete: "set null",
    }),
    trainingAttemptId: text("training_attempt_id"),
    /**
     * Карточка оператора 112, из которой создана входящая доставка. Старые
     * автономные упражнения не имеют источника и остаются совместимыми.
     */
    sourceTrainingSessionId: text("source_training_session_id").references(
      () => incidentCards.trainingSessionId,
      { onDelete: "restrict" },
    ),
    addressedService: dispatchService("addressed_service").notNull(),
    status: ddsResponseStatus("status").notNull().default("pending"),
    card: jsonb("card").$type<DdsCardSnapshot>().notNull(),
    acknowledgementDeadlineAt: timestamp("acknowledgement_deadline_at", {
      withTimezone: true,
    }).notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastSequence: integer("last_sequence").notNull().default(1),
    score: smallint("score"),
    passThreshold: smallint("pass_threshold").notNull().default(75),
    passed: boolean("passed"),
    /** Makes a retried start command return the exercise it already created. */
    startEventId: text("start_event_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("dds_exercises_operator_start_event_unique_idx").on(
      table.operatorId,
      table.startEventId,
    ),
    index("dds_exercises_operator_created_idx").on(
      table.operatorId,
      table.createdAt,
    ),
    index("dds_exercises_status_idx").on(table.status),
    index("dds_exercises_training_attempt_idx").on(table.trainingAttemptId),
    uniqueIndex("dds_exercises_source_service_unique_idx")
      .on(table.sourceTrainingSessionId, table.addressedService)
      .where(sql`${table.sourceTrainingSessionId} is not null`),
  ],
);

/** Immutable timeline used by the deterministic debrief. */
export const ddsExerciseEvents = pgTable(
  "dds_exercise_events",
  {
    id: text("id").primaryKey(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => ddsExercises.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    eventId: text("event_id").notNull(),
    fromStatus: ddsResponseStatus("from_status"),
    toStatus: ddsResponseStatus("to_status").notNull(),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    comment: text("comment"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("dds_exercise_events_sequence_unique_idx").on(
      table.exerciseId,
      table.sequence,
    ),
    uniqueIndex("dds_exercise_events_event_unique_idx").on(
      table.exerciseId,
      table.eventId,
    ),
    index("dds_exercise_events_exercise_idx").on(table.exerciseId),
  ],
);

export type DdsExerciseRecord = typeof ddsExercises.$inferSelect;

/** Append-only instructor assessments; they never overwrite the automatic score. */
export const ddsExerciseReviews = pgTable("dds_exercise_reviews", {
  id: text("id").primaryKey(),
  exerciseId: text("exercise_id").notNull().references(() => ddsExercises.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(),
  instructorId: text("instructor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  score: smallint("score").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("dds_reviews_exercise_event_idx").on(table.exerciseId, table.eventId),
  check("dds_exercise_reviews_score_check", sql`${table.score} between 0 and 100`),
]);
export type NewDdsExerciseRecord = typeof ddsExercises.$inferInsert;
export type DdsExerciseEventRecord = typeof ddsExerciseEvents.$inferSelect;
export type NewDdsExerciseEventRecord = typeof ddsExerciseEvents.$inferInsert;
