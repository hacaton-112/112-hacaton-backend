import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { DialogueEntry } from "@/contracts/dialogue-preparation";
import type { ScenarioSeed } from "@/modules/scenario-engine/domain/scenario-seed.schema";
import type { scenarioAudioPacks } from "./scenario-audio.schema";
import { users } from "./user.schema";

/** Instructor-only immutable scenario snapshot; edits to the review use optimistic revision checks. */
export const dialoguePreparations = pgTable(
  "dialogue_preparations",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    snapshotHash: text("snapshot_hash").notNull(),
    snapshot: jsonb("snapshot").$type<ScenarioSeed>().notNull(),
    authoringSource: text("authoring_source", { enum: ["manual", "assistant"] })
      .notNull()
      .default("manual"),
    authoringPrompt: text("authoring_prompt"),
    revision: integer("revision").notNull().default(1),
    status: text("status", {
      enum: [
        "queued",
        "generating",
        "review",
        "synthesizing",
        "ready",
        "failed",
        "published",
      ],
    })
      .notNull()
      .default("queued"),
    entries: jsonb("entries").$type<DialogueEntry[]>().notNull().default([]),
    assets: jsonb("assets")
      .$type<typeof scenarioAudioPacks.$inferSelect.assets>()
      .notNull()
      .default({}),
    completed: integer("completed").notNull().default(0),
    total: integer("total").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    leaseToken: text("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    error: text("error", { enum: ["generation_failed", "synthesis_failed"] }),
    scenarioVersionId: text("scenario_version_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("dialogue_preparation_owner_snapshot_idx").on(
      table.ownerId,
      table.snapshotHash,
    ),
  ],
);
