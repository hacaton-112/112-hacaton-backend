import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./user.schema";

export const SCENARIO_GENERATION_STATUSES = [
  "queued",
  "running",
  "done",
  "failed",
] as const;

export const scenarioGenerationStatus = pgEnum(
  "scenario_generation_status",
  SCENARIO_GENERATION_STATUSES,
);

/**
 * Задание на черновик сценария от помощника.
 *
 * Генерация идёт в фоне: модель на CPU отвечает секундами, а преподавателей
 * может быть сколько угодно, поэтому запрос не держит HTTP-соединение, а
 * встаёт в очередь. Задание берётся в работу на срок аренды: если процесс
 * упал посреди генерации, аренда истекает и задание подхватывается снова.
 */
export const scenarioGenerationJobs = pgTable(
  "scenario_generation_jobs",
  {
    id: text("id").primaryKey(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    brief: text("brief").notNull(),
    status: scenarioGenerationStatus("status").notNull().default("queued"),
    /** Сколько раз задание брали в работу; после третьего — отказ. */
    attempts: smallint("attempts").notNull().default(0),
    leaseToken: text("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    /** Готовый черновик в том же виде, что отдаёт синхронный маршрут. */
    result: jsonb("result").$type<unknown>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** Преподаватель убрал задание из списка; само оно не удаляется. */
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (table) => [
    index("scenario_generation_jobs_queue_idx").on(
      table.status,
      table.createdAt,
    ),
    index("scenario_generation_jobs_owner_idx").on(
      table.createdBy,
      table.createdAt,
    ),
  ],
);

export type ScenarioGenerationJobRecord =
  typeof scenarioGenerationJobs.$inferSelect;
export type ScenarioGenerationStatus =
  (typeof SCENARIO_GENERATION_STATUSES)[number];
