import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { scenarioVersions } from "./scenario.schema";

export const CALL_STAGES = [
  "offered",
  "conversation",
  "wrap_up",
  "ended",
  "declined",
] as const;

export const CALL_EVENT_ACTORS = [
  "operator",
  "caller",
  "instructor",
  "system",
] as const;

export const CALL_EVENT_TYPES = [
  "call.offered",
  "call.accepted",
  "call.declined",
  "operator.utterance",
  "caller.reply",
  "panic.changed",
  "caller.initiative",
  "caller.interrupted",
  "fact.revealed",
  "fact.rejected",
  "stage.changed",
  "instructor.intervened",
  "call.ended",
] as const;

export const callStage = pgEnum("call_stage", CALL_STAGES);
export const callEventActor = pgEnum("call_event_actor", CALL_EVENT_ACTORS);
export const callEventType = pgEnum("call_event_type", CALL_EVENT_TYPES);

export type CallStage = (typeof CALL_STAGES)[number];
export type CallEventActor = (typeof CALL_EVENT_ACTORS)[number];
export type CallEventType = (typeof CALL_EVENT_TYPES)[number];

/**
 * Проекция журнала: текущее состояние одного учебного звонка.
 *
 * Источник истины — `call_events`; эта строка существует ради скорости и
 * пересобирается из журнала, если разойдётся.
 */
export const callStates = pgTable(
  "call_states",
  {
    trainingSessionId: text("training_session_id").primaryKey(),
    scenarioVersionId: text("scenario_version_id")
      .notNull()
      .references(() => scenarioVersions.id, { onDelete: "restrict" }),
    stage: callStage("stage").notNull().default("offered"),
    panicLevel: smallint("panic_level").notNull(),
    panicChangedAt: timestamp("panic_changed_at", { withTimezone: true }),
    /** Засев генератора: с ним разбор воспроизводит те же перебивания. */
    rngSeed: text("rng_seed").notNull(),
    interruptionsUsed: smallint("interruptions_used").notNull().default(0),
    lastInitiativeAt: timestamp("last_initiative_at", { withTimezone: true }),
    operatorSilenceSince: timestamp("operator_silence_since", {
      withTimezone: true,
    }),
    revealedFactKeys: text("revealed_fact_keys").array().notNull().default([]),
    callerTurns: smallint("caller_turns").notNull().default(0),
    offeredAt: timestamp("offered_at", { withTimezone: true }).notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    lastSequence: integer("last_sequence").notNull().default(0),
  },
  (table) => [
    index("call_states_scenario_version_idx").on(table.scenarioVersionId),
    index("call_states_stage_idx").on(table.stage),
  ],
);

/**
 * Журнал хода звонка. Порядок задаёт `sequence`, а не время: две записи в одну
 * миллисекунду обязаны остаться различимыми.
 */
export const callEvents = pgTable(
  "call_events",
  {
    id: text("id").primaryKey(),
    trainingSessionId: text("training_session_id").notNull(),
    sequence: integer("sequence").notNull(),
    type: callEventType("type").notNull(),
    actor: callEventActor("actor").notNull(),
    /** Идентификатор команды: повтор с тем же значением ничего не меняет. */
    eventId: text("event_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("call_events_session_sequence_unique_idx").on(
      table.trainingSessionId,
      table.sequence,
    ),
    uniqueIndex("call_events_session_event_unique_idx").on(
      table.trainingSessionId,
      table.eventId,
    ),
    index("call_events_session_idx").on(table.trainingSessionId),
  ],
);

export type CallStateRecord = typeof callStates.$inferSelect;
export type NewCallStateRecord = typeof callStates.$inferInsert;
export type CallEventRecord = typeof callEvents.$inferSelect;
export type NewCallEventRecord = typeof callEvents.$inferInsert;
