import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { scenarioVersions } from "./scenario.schema";

/** Private assets of an immutable version, never included in the operator catalog. */
export const scenarioAudioPacks = pgTable("scenario_audio_packs", {
  scenarioVersionId: text("scenario_version_id")
    .primaryKey()
    .references(() => scenarioVersions.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["queued", "preparing", "ready", "failed"] })
    .notNull()
    .default("queued"),
  completed: integer("completed").notNull().default(0),
  total: integer("total").notNull().default(0),
  assets: jsonb("assets")
    .$type<
      Record<
        string,
        { key: string; sampleRate: number; bytes: number; sha256: string }
      >
    >()
    .notNull()
    .default({}),
  leaseToken: text("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
