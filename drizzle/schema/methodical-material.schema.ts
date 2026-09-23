import {
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users, type UserRole } from "./user.schema";

export interface StoredMethodicalSection {
  id: string;
  title: string;
  summary: string;
  contentMarkdown: string;
}

/**
 * Editable material is stored as one aggregate: sections are ordered, always
 * saved together and validated at the HTTP boundary. Built-in materials stay
 * in code until first edit, when a row with the same stable id overrides them.
 */
export const methodicalMaterials = pgTable(
  "methodical_materials",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    audience: text("audience").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    roles: jsonb("roles").$type<UserRole[]>().notNull(),
    sections: jsonb("sections").$type<StoredMethodicalSection[]>().notNull(),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("methodical_materials_updated_idx").on(table.updatedAt)],
);

export type MethodicalMaterialRecord = typeof methodicalMaterials.$inferSelect;
export type NewMethodicalMaterialRecord =
  typeof methodicalMaterials.$inferInsert;

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
