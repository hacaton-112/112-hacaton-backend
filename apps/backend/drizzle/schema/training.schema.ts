import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { scenarioVersions } from "./scenario.schema";
import { users } from "./user.schema";

export const GROUP_STATUSES = ["active", "archived"] as const;
export const ASSIGNMENT_STATUSES = [
  "draft",
  "in_progress",
  "completed",
  "archived",
] as const;
export const ASSIGNMENT_TYPES = ["voice_call", "card_action", "mixed"] as const;
/**
 * Откуда берутся карточки занятия (ТЗ, стр. 15): сгенерированные системой,
 * из билетов, сформированные обучающимися на звонках или смешанный набор
 * сгенерированных и сформированных.
 */
export const CARD_SOURCES = [
  "generated",
  "ticket",
  "operator_call",
  "mixed",
] as const;
export const ATTEMPT_STATUSES = [
  "offered",
  "active",
  "completed",
  "declined",
  "cancelled_by_instructor",
  "abandoned",
] as const;

export type GroupStatus = (typeof GROUP_STATUSES)[number];
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];
export type CardSource = (typeof CARD_SOURCES)[number];
export type TrainingAttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const groupStatus = pgEnum("training_group_status", GROUP_STATUSES);
export const assignmentStatus = pgEnum(
  "training_assignment_status",
  ASSIGNMENT_STATUSES,
);
export const assignmentType = pgEnum(
  "training_assignment_type",
  ASSIGNMENT_TYPES,
);
export const trainingAttemptStatus = pgEnum(
  "training_attempt_status",
  ATTEMPT_STATUSES,
);
export const cardSource = pgEnum("training_card_source", CARD_SOURCES);

export const trainingGroups = pgTable(
  "training_groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    organization: text("organization").notNull(),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: groupStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("training_groups_code_unique_idx").on(table.code),
    index("training_groups_instructor_idx").on(table.instructorId),
    index("training_groups_status_idx").on(table.status),
  ],
);

export const trainingGroupMembers = pgTable(
  "training_group_members",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => trainingGroups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serviceTag: text("service_tag").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("training_group_members_group_user_unique_idx").on(
      table.groupId,
      table.userId,
    ),
    index("training_group_members_user_idx").on(table.userId),
  ],
);

export const trainingAssignments = pgTable(
  "training_assignments",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    scenarioVersionId: text("scenario_version_id")
      .notNull()
      .references(() => scenarioVersions.id, { onDelete: "restrict" }),
    groupId: text("group_id").references(() => trainingGroups.id, {
      onDelete: "cascade",
    }),
    targetUserId: text("target_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    type: assignmentType("type").notNull().default("voice_call"),
    cardSource: cardSource("card_source").notNull().default("generated"),
    serviceTag: text("service_tag"),
    answerNormSeconds: integer("answer_norm_seconds").notNull().default(240),
    passThreshold: integer("pass_threshold").notNull().default(75),
    maxAttempts: integer("max_attempts").default(3),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: assignmentStatus("status").notNull().default("draft"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "training_assignments_one_target_check",
      sql`(${table.groupId} is not null) <> (${table.targetUserId} is not null)`,
    ),
    check(
      "training_assignments_pass_threshold_check",
      sql`${table.passThreshold} between 50 and 100`,
    ),
    check(
      "training_assignments_answer_norm_check",
      sql`${table.answerNormSeconds} > 0`,
    ),
    check(
      "training_assignments_max_attempts_check",
      sql`${table.maxAttempts} is null or ${table.maxAttempts} > 0`,
    ),
    index("training_assignments_group_idx").on(table.groupId),
    index("training_assignments_target_user_idx").on(table.targetUserId),
    index("training_assignments_scenario_version_idx").on(
      table.scenarioVersionId,
    ),
    index("training_assignments_status_idx").on(table.status),
  ],
);

export const trainingAttempts = pgTable(
  "training_attempts",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => trainingAssignments.id, { onDelete: "cascade" }),
    operatorId: text("operator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    trainingSessionId: text("training_session_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: trainingAttemptStatus("status").notNull().default("offered"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("training_attempts_session_unique_idx").on(
      table.trainingSessionId,
    ),
    uniqueIndex("training_attempts_number_unique_idx").on(
      table.assignmentId,
      table.operatorId,
      table.attemptNumber,
    ),
    uniqueIndex("training_attempts_operator_active_unique_idx")
      .on(table.operatorId)
      .where(sql`${table.status} in ('offered', 'active')`),
    index("training_attempts_operator_idx").on(table.operatorId),
    index("training_attempts_status_idx").on(table.status),
  ],
);

export type TrainingGroupRecord = typeof trainingGroups.$inferSelect;
export type TrainingAssignmentRecord = typeof trainingAssignments.$inferSelect;
export type TrainingAttemptRecord = typeof trainingAttempts.$inferSelect;
