import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { ddsLessons } from "./dds-exercise.schema";

export const DDS_INSIGHTS_STATUSES = [
  "pending",
  "processing",
  "done",
  "failed",
] as const;

export const ddsInsightsStatus = pgEnum(
  "dds_insights_status",
  DDS_INSIGHTS_STATUSES,
);

/** Устойчивое задание и результат выводов по завершённому занятию. */
export const ddsLessonInsights = pgTable(
  "dds_lesson_insights",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => ddsLessons.id, { onDelete: "cascade" }),
    status: ddsInsightsStatus("status").notNull().default("pending"),
    strengths: jsonb("strengths").$type<string[]>().notNull().default([]),
    weaknesses: jsonb("weaknesses").$type<string[]>().notNull().default([]),
    recommendations: jsonb("recommendations")
      .$type<string[]>()
      .notNull()
      .default([]),
    focusScenarios: jsonb("focus_scenarios")
      .$type<string[]>()
      .notNull()
      .default([]),
    attemptCount: integer("attempt_count").notNull().default(0),
    leaseToken: text("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    model: text("model"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("dds_lesson_insights_lesson_unique_idx").on(table.lessonId),
    index("dds_lesson_insights_status_lease_idx").on(
      table.status,
      table.leaseUntil,
    ),
  ],
);

export type DdsLessonInsightsRecord = typeof ddsLessonInsights.$inferSelect;
