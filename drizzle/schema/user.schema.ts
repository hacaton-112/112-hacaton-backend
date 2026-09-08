import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const USER_ROLES = ["operator", "instructor", "admin"] as const;

/**
 * A database enum rather than a text column: the set of roles is fixed by the
 * product, and Postgres should reject an unknown one instead of leaving the
 * check to whichever code path happens to write the row.
 */
export const userRole = pgEnum("user_role", USER_ROLES);

export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    role: userRole("role").notNull().default("operator"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("users_email_unique_idx").on(table.email)],
);

export type UserRecord = typeof users.$inferSelect;
export type NewUserRecord = typeof users.$inferInsert;
