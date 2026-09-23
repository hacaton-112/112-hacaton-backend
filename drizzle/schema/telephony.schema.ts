import { sql } from "drizzle-orm";
import {
  boolean,
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
import { dispatchService } from "./incident-card.schema";
import { users } from "./user.schema";

/**
 * Наряды, которым диспетчер ДДС передаёт карточку по телефону.
 *
 * Номер — внутренний номер учебной IP-АТС: его набирают с рабочего места, и по
 * нему приложение понимает, какой наряд ответил. Служба нужна для проверки:
 * звонок засчитывается, только если набран наряд той службы, которой
 * адресована карточка.
 */
export const rescueCrews = pgTable(
  "rescue_crews",
  {
    id: text("id").primaryKey(),
    service: dispatchService("service").notNull(),
    callsign: text("callsign").notNull(),
    phoneNumber: text("phone_number").notNull(),
    /** Голос синтеза: у наряда он свой, чтобы его не путали с заявителем. */
    voiceId: text("voice_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("rescue_crews_phone_number_unique_idx").on(table.phoneNumber),
    index("rescue_crews_service_idx").on(table.service),
  ],
);

/**
 * Рабочее место ДДС в учебной IP-АТС.
 *
 * Asterisk знает только внутренний номер звонящего; кто сидит за телефоном,
 * знает эта таблица. Без неё звонок нельзя отнести к карточке диспетчера.
 */
export const telephonyWorkstations = pgTable(
  "telephony_workstations",
  {
    extension: text("extension").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("telephony_workstations_user_unique_idx").on(table.userId),
  ],
);

export const CREW_CALL_OUTCOMES = [
  /** Наряд выслушал диспетчера и подтвердил приём. */
  "completed",
  /** Диспетчер положил трубку, так ничего и не сказав. */
  "abandoned",
  /** Набран номер, которого нет в справочнике нарядов. */
  "unknown_number",
] as const;

export type CrewCallOutcome = (typeof CREW_CALL_OUTCOMES)[number];

export const CREW_CALL_ASR_STATUSES = [
  "not_started",
  "completed",
  "unavailable",
] as const;

export type CrewCallAsrStatus = (typeof CREW_CALL_ASR_STATUSES)[number];

export const crewCallOutcome = pgEnum("crew_call_outcome", CREW_CALL_OUTCOMES);

/**
 * Звонок диспетчера ДДС наряду.
 *
 * Звонок относится к доставке, которую диспетчер принял и ещё не передал: так
 * звонок на чужой номер тоже виден в оценке, а не пропадает. Исход и
 * правильность известны только после окончания разговора.
 */
export const ddsCrewCalls = pgTable(
  "dds_crew_calls",
  {
    id: text("id").primaryKey(),
    exerciseId: text("exercise_id").references(() => ddsExercises.id, {
      onDelete: "cascade",
    }),
    crewId: text("crew_id").references(() => rescueCrews.id, {
      onDelete: "set null",
    }),
    callerUserId: text("caller_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    callerExtension: text("caller_extension").notNull(),
    dialedNumber: text("dialed_number").notNull(),
    /** Идентификатор канала Asterisk: по нему приходят события звонка. */
    channelId: text("channel_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    acknowledgements: integer("acknowledgements").notNull().default(0),
    /** Финальные фразы ASR в порядке произнесения. */
    transcript: text("transcript").notNull().default(""),
    /** Детерминированное покрытие обязательных частей карточки. */
    validation: jsonb("validation").$type<{
      readonly complete: boolean;
      readonly coveredFields: readonly string[];
      readonly missingFields: readonly string[];
    }>(),
    asrStatus: text("asr_status")
      .$type<CrewCallAsrStatus>()
      .notNull()
      .default("not_started"),
    outcome: crewCallOutcome("outcome"),
    /** Набран наряд той службы, которой адресована карточка. */
    correct: boolean("correct"),
  },
  (table) => [
    uniqueIndex("dds_crew_calls_channel_unique_idx").on(table.channelId),
    index("dds_crew_calls_exercise_idx").on(table.exerciseId),
    check(
      "dds_crew_calls_asr_status_check",
      sql`${table.asrStatus} in ('not_started', 'completed', 'unavailable')`,
    ),
  ],
);

/**
 * Идемпотентная команда экранного телефона.
 *
 * Сначала резервируем `eventId` и заранее назначенный ARI channel id, затем
 * просим Asterisk позвонить на SIP-телефон рабочего места. Если HTTP-ответ
 * потерялся, повтор команды использует тот же канал и не создаёт второй звонок.
 */
export const ddsCrewCallCommands = pgTable(
  "dds_crew_call_commands",
  {
    eventId: text("event_id").primaryKey(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => ddsExercises.id, { onDelete: "cascade" }),
    operatorId: text("operator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    callerExtension: text("caller_extension").notNull(),
    dialedNumber: text("dialed_number").notNull(),
    channelId: text("channel_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("dds_crew_call_commands_channel_unique_idx").on(
      table.channelId,
    ),
    index("dds_crew_call_commands_exercise_idx").on(table.exerciseId),
  ],
);
