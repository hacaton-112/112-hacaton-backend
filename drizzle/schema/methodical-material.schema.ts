import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./user.schema";

/** Completion is stored per section so materials can evolve without resetting a whole course. */
export const methodicalSectionProgress = pgTable(
  "methodical_section_progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    materialId: text("material_id").notNull(),
    sectionId: text("section_id").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("methodical_progress_user_section_unique_idx").on(
      table.userId,
      table.materialId,
      table.sectionId,
    ),
    index("methodical_progress_user_idx").on(table.userId),
  ],
);

export type MethodicalSectionProgressRecord =
  typeof methodicalSectionProgress.$inferSelect;
