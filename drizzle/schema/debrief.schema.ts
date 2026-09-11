import {
  index,
  pgTable,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { callStates } from "./call.schema";
import { scenarioVersions } from "./scenario.schema";

/**
 * Оценка закончившегося звонка.
 *
 * Считается один раз при первом открытии разбора и хранится: звонок больше не
 * меняется, а сравнение с группой — это среднее по чужим оценкам, и считать их
 * заново на каждое открытие значило бы перечитывать все звонки сценария.
 */
export const callEvaluations = pgTable(
  "call_evaluations",
  {
    trainingSessionId: text("training_session_id")
      .primaryKey()
      .references(() => callStates.trainingSessionId, { onDelete: "cascade" }),
    scenarioVersionId: text("scenario_version_id")
      .notNull()
      .references(() => scenarioVersions.id, { onDelete: "cascade" }),
    score: smallint("score").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Среднее по сценарию: сравнение с группой читает именно этот индекс.
    index("call_evaluations_version_idx").on(table.scenarioVersionId),
  ],
);

export type CallEvaluationRecord = typeof callEvaluations.$inferSelect;
export type NewCallEvaluationRecord = typeof callEvaluations.$inferInsert;
