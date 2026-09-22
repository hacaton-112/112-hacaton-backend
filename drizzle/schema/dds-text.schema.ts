import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { ddsExercises } from "./dds-exercise.schema";
import { dispatchService, type DispatchService } from "./incident-card.schema";
import { scenarioVersions } from "./scenario.schema";
import { users } from "./user.schema";

export interface DdsReferenceItem {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly approved: boolean;
}

export interface DdsTextCoverageItem {
  readonly id: string;
  readonly label: string;
  readonly status: "present" | "missing";
  readonly quote: string | null;
}

export interface DdsTextContradiction {
  readonly description: string;
  readonly quote: string;
}

export const DDS_REFERENCE_STATUSES = ["draft", "approved"] as const;
export const DDS_EXPECTED_OUTCOMES = ["accept", "refuse"] as const;
export const DDS_TEXT_EVALUATION_STATUSES = [
  "pending",
  "done",
  "failed",
  "skipped",
] as const;

export const ddsReferenceStatus = pgEnum(
  "dds_reference_status",
  DDS_REFERENCE_STATUSES,
);
export const ddsExpectedOutcome = pgEnum(
  "dds_expected_outcome",
  DDS_EXPECTED_OUTCOMES,
);
export const ddsTextEvaluationStatus = pgEnum(
  "dds_text_evaluation_status",
  DDS_TEXT_EVALUATION_STATUSES,
);

export const ddsCardReferences = pgTable(
  "dds_card_references",
  {
    id: text("id").primaryKey(),
    scenarioVersionId: text("scenario_version_id").references(
      () => scenarioVersions.id,
      { onDelete: "cascade" },
    ),
    exerciseId: text("exercise_id").references(() => ddsExercises.id, {
      onDelete: "cascade",
    }),
    expectedOutcome: ddsExpectedOutcome("expected_outcome").notNull(),
    refusalReasons: jsonb("refusal_reasons")
      .$type<string[]>()
      .notNull()
      .default([]),
    requiredItems: jsonb("required_items")
      .$type<DdsReferenceItem[]>()
      .notNull(),
    expectedCrewService: dispatchService(
      "expected_crew_service",
    ).$type<DispatchService>(),
    status: ddsReferenceStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    approvedBy: text("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    generationComment: text("generation_comment"),
    leaseOwner: text("lease_owner"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "dds_card_references_one_source_check",
      sql`(${table.scenarioVersionId} is not null) <> (${table.exerciseId} is not null)`,
    ),
    uniqueIndex("dds_card_references_scenario_unique_idx")
      .on(table.scenarioVersionId)
      .where(sql`${table.scenarioVersionId} is not null`),
    uniqueIndex("dds_card_references_exercise_unique_idx")
      .on(table.exerciseId)
      .where(sql`${table.exerciseId} is not null`),
    index("dds_card_references_status_idx").on(table.status),
  ],
);

export const ddsTextEvaluations = pgTable(
  "dds_text_evaluations",
  {
    id: text("id").primaryKey(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => ddsExercises.id, { onDelete: "cascade" }),
    status: ddsTextEvaluationStatus("status").notNull().default("pending"),
    referenceVersion: integer("reference_version"),
    coverage: jsonb("coverage")
      .$type<DdsTextCoverageItem[]>()
      .notNull()
      .default([]),
    contradictions: jsonb("contradictions")
      .$type<DdsTextContradiction[]>()
      .notNull()
      .default([]),
    summary: text("summary"),
    grammar: jsonb("grammar").$type<Record<string, unknown>>(),
    model: text("model"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    leaseOwner: text("lease_owner"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("dds_text_evaluations_exercise_unique_idx").on(
      table.exerciseId,
    ),
    index("dds_text_evaluations_status_idx").on(table.status),
  ],
);

export type DdsCardReferenceRecord = typeof ddsCardReferences.$inferSelect;
export type DdsTextEvaluationRecord = typeof ddsTextEvaluations.$inferSelect;
