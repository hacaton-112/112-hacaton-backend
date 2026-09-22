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
import { scenarioCategory, type ScenarioCategory } from "./scenario.schema";
import { trainingGroups } from "./training.schema";
import { users } from "./user.schema";

export const DDS_LESSON_STATUSES = ["active", "finished"] as const;
export const DDS_LESSON_CARD_SOURCES = [
  "generated",
  "operator_call",
  "mixed",
] as const;
export type DdsLessonStatus = (typeof DDS_LESSON_STATUSES)[number];
export type DdsLessonCardSource = (typeof DDS_LESSON_CARD_SOURCES)[number];

export const ddsLessonStatus = pgEnum("dds_lesson_status", DDS_LESSON_STATUSES);
export const ddsLessonCardSource = pgEnum(
  "dds_lesson_card_source",
  DDS_LESSON_CARD_SOURCES,
);

/** Поток карточек преподавателя, независимый от одиночных назначений. */
export const ddsLessons = pgTable(
  "dds_lessons",
  {
    id: text("id").primaryKey(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    groupId: text("group_id").references(() => trainingGroups.id, {
      onDelete: "restrict",
    }),
    targetUserId: text("target_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    title: text("title").notNull(),
    categories: scenarioCategory("categories")
      .array()
      .$type<ScenarioCategory[]>()
      .notNull(),
    cardSource: ddsLessonCardSource("card_source").notNull(),
    acknowledgementNormSeconds: integer("acknowledgement_norm_seconds")
      .notNull()
      .default(30),
    passThreshold: smallint("pass_threshold").notNull().default(75),
    status: ddsLessonStatus("status").notNull().default("active"),
    startEventId: text("start_event_id").notNull(),
    finishEventId: text("finish_event_id"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    finishedBy: text("finished_by").references(() => users.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    check(
      "dds_lessons_one_target_check",
      sql`(${table.groupId} is not null) <> (${table.targetUserId} is not null)`,
    ),
    check(
      "dds_lessons_categories_nonempty_check",
      sql`cardinality(${table.categories}) > 0`,
    ),
    check(
      "dds_lessons_acknowledgement_norm_check",
      sql`${table.acknowledgementNormSeconds} between 10 and 300`,
    ),
    check(
      "dds_lessons_pass_threshold_check",
      sql`${table.passThreshold} between 50 and 100`,
    ),
    uniqueIndex("dds_lessons_creator_start_event_unique_idx").on(
      table.createdBy,
      table.startEventId,
    ),
    index("dds_lessons_group_idx").on(table.groupId),
    index("dds_lessons_target_user_idx").on(table.targetUserId),
    index("dds_lessons_status_idx").on(table.status),
  ],
);

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
    lessonId: text("lesson_id").references(() => ddsLessons.id, {
      onDelete: "restrict",
    }),
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
    /**
     * Повтор команды запуска не создаёт второе упражнение.
     *
     * Только для самостоятельно начатых: у доставок из 112 общий идентификатор
     * команды на все службы, и диспетчер, ведущий две службы сразу, законно
     * владеет двумя карточками одной отправки. Их неповторимость обеспечивает
     * индекс по исходной сессии и службе.
     */
    uniqueIndex("dds_exercises_operator_start_event_unique_idx")
      .on(table.operatorId, table.startEventId)
      .where(sql`${table.sourceTrainingSessionId} is null`),
    index("dds_exercises_operator_created_idx").on(
      table.operatorId,
      table.createdAt,
    ),
    index("dds_exercises_status_idx").on(table.status),
    index("dds_exercises_training_attempt_idx").on(table.trainingAttemptId),
    index("dds_exercises_lesson_idx").on(table.lessonId),
    uniqueIndex("dds_exercises_lesson_operator_active_unique_idx")
      .on(table.lessonId, table.operatorId)
      .where(
        sql`${table.lessonId} is not null and ${table.completedAt} is null`,
      ),
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
export type DdsLessonRecord = typeof ddsLessons.$inferSelect;

/** Append-only instructor assessments; they never overwrite the automatic score. */
export const ddsExerciseReviews = pgTable(
  "dds_exercise_reviews",
  {
    id: text("id").primaryKey(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => ddsExercises.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    score: smallint("score").notNull(),
    comment: text("comment").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("dds_reviews_exercise_event_idx").on(
      table.exerciseId,
      table.eventId,
    ),
    check(
      "dds_exercise_reviews_score_check",
      sql`${table.score} between 0 and 100`,
    ),
  ],
);
export type NewDdsExerciseRecord = typeof ddsExercises.$inferInsert;
export type DdsExerciseEventRecord = typeof ddsExerciseEvents.$inferSelect;
export type NewDdsExerciseEventRecord = typeof ddsExerciseEvents.$inferInsert;
