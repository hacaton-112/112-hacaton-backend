import {
  boolean,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { callStates } from "./call.schema";
import {
  classifierEntries,
  type ClassifierRoutingSnapshot,
} from "./classifier.schema";

/**
 * Службы так, как они подписаны в АРМ.
 *
 * Коды — транскрипция ярлыков заказчика, а не выдуманный перевод: `dds_01`
 * это пожарная охрана, но называть её в карточке иначе, чем на кнопке, значит
 * заставлять оператора и разбор говорить на разных языках. Соответствие
 * `dds_01 → fire` знает оценка, которой сценарий называет ожидаемые службы.
 */
export const DISPATCH_SERVICES = [
  "dds_01",
  "dds_02",
  "dds_03",
  "dds_04",
  "zhkh",
  "antiterror",
  "eddc",
  "uadit",
  "rosgvardia",
  "cuks",
  "ass",
  "lpc",
  "ss",
] as const;

/** Метки происшествия: в макете это ряд переключаемых чипов. */
export const INCIDENT_CATEGORIES = [
  "socially_significant",
  "threat_to_people",
  "emergency_threat",
  "important",
] as const;

export const dispatchService = pgEnum("dispatch_service", DISPATCH_SERVICES);
export const incidentCategory = pgEnum(
  "incident_category",
  INCIDENT_CATEGORIES,
);

export type DispatchService = (typeof DISPATCH_SERVICES)[number];
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

/**
 * Карточка происшествия — то, что оператор заполняет по ходу разговора.
 *
 * Одна карточка на один учебный звонок: разбор занятия сравнивает её с
 * эталонной анкетой сценария, поэтому карточка живёт ровно столько же, сколько
 * звонок, и закрывается вместе с ним.
 */
export const incidentCards = pgTable(
  "incident_cards",
  {
    trainingSessionId: text("training_session_id")
      .primaryKey()
      .references(() => callStates.trainingSessionId, { onDelete: "cascade" }),

    // ── Заявитель ────────────────────────────────────────────────
    callerAnonymous: boolean("caller_anonymous").notNull().default(false),
    callerLastName: text("caller_last_name"),
    callerFirstName: text("caller_first_name"),
    callerMiddleName: text("caller_middle_name"),
    callerLanguage: text("caller_language"),
    callerPhone: text("caller_phone"),

    // ── Место происшествия ───────────────────────────────────────
    /** Полная строка остаётся для быстрого ввода и старых карточек. */
    addressText: text("address_text"),
    country: text("country"),
    federalSubject: text("federal_subject"),
    city: text("city"),
    settlement: text("settlement"),
    administrativeDistrict: text("administrative_district"),
    district: text("district"),
    objectType: text("object_type"),
    street: text("street"),
    house: text("house"),
    building: text("building"),
    corpus: text("corpus"),
    apartment: text("apartment"),
    entrance: text("entrance"),
    floor: text("floor"),
    intercom: text("intercom"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    /** Отметка «Рядом»: заявитель находится на месте происшествия. */
    nearby: boolean("nearby").notNull().default(false),
    placeNotes: text("place_notes"),

    // ── О происшествии ───────────────────────────────────────────
    classifierEntryId: text("classifier_entry_id").references(
      () => classifierEntries.id,
      { onDelete: "restrict" },
    ),
    classifierQualifierCodes: text("classifier_qualifier_codes")
      .array()
      .notNull()
      .default([]),
    /**
     * Snapshot of the immutable version used for this call. A later classifier
     * activation must not rewrite the operator's completed incident card.
     */
    classifierRouting:
      jsonb("classifier_routing").$type<ClassifierRoutingSnapshot>(),
    incidentType: text("incident_type"),
    categories: incidentCategory("categories").array().notNull().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }),
    victimsTotal: smallint("victims_total"),
    victimsChildren: smallint("victims_children"),
    deathsTotal: smallint("deaths_total"),
    deathsChildren: smallint("deaths_children"),
    description: text("description"),

    // ── Службы ───────────────────────────────────────────────────
    services: dispatchService("services").array().notNull().default([]),

    /** Пока пусто, карточку можно править; после — только читать. */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("incident_cards_submitted_at_idx").on(table.submittedAt)],
);

/**
 * Пострадавшие: в макете это повторяемый блок с кнопкой «Добавить», поэтому
 * отдельная таблица, а не поля в карточке.
 */
export const incidentCardVictims = pgTable(
  "incident_card_victims",
  {
    id: text("id").primaryKey(),
    trainingSessionId: text("training_session_id")
      .notNull()
      .references(() => incidentCards.trainingSessionId, {
        onDelete: "cascade",
      }),
    /** Порядок в списке: оператор добавляет пострадавших сверху вниз. */
    orderIndex: smallint("order_index").notNull(),
    lastName: text("last_name"),
    firstName: text("first_name"),
    middleName: text("middle_name"),
    /** «Повод вызова» из макета. */
    reason: text("reason"),
    birthDate: text("birth_date"),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("incident_card_victims_session_order_unique_idx").on(
      table.trainingSessionId,
      table.orderIndex,
    ),
  ],
);
