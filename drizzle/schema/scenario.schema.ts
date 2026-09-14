import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./user.schema";

export const SCENARIO_CATEGORIES = [
  "fire",
  "road_accident",
  "medical",
  "criminal",
  "gas_leak",
  "other",
] as const;

export const SCENARIO_STATUSES = ["draft", "published", "archived"] as const;
export const CALLER_GENDERS = ["male", "female"] as const;

export const AUTHORING_SOURCES = ["manual", "assistant", "imported"] as const;

export const FACT_SEVERITIES = ["normal", "heavy"] as const;

/** Поля карточки происшествия, в которые ложатся раскрытые факты. */
export const INCIDENT_CARD_FIELDS = [
  "city",
  "street",
  "house",
  "entrance",
  "floor",
  "apartment",
  "object_type",
  "landmarks",
  "caller_name",
  "caller_phone",
  "caller_type",
  "dispatcher_notes",
  "category",
  "clarification",
  "started_at",
  "victims_total",
  "children_count",
  "victims_condition",
] as const;

export const TERRAIN_TYPES = [
  "city_dense",
  "city_block",
  "highway",
  "open_field",
  "forest",
  "indoor",
] as const;

export const LOCATOR_ACCURACIES = [
  "identified",
  "approximate",
  "unavailable",
] as const;

export const EMERGENCY_SERVICES = [
  "fire",
  "police",
  "ambulance",
  "gas",
] as const;

export const REFERENCE_COMPARISONS = [
  "exact",
  "normalized",
  "numeric_range",
  "contains",
] as const;

export const ESCALATION_TRIGGERS = [
  "operator_silence",
  "question_repeated",
  "heavy_fact_revealed",
  "norm_time_elapsed",
  "forbidden_phrase",
  "calming_phrase",
  "services_confirmed",
  "instruction_followed",
] as const;

export const ESCALATION_DIRECTIONS = ["up", "down"] as const;

export const scenarioCategory = pgEnum(
  "scenario_category",
  SCENARIO_CATEGORIES,
);
export const scenarioStatus = pgEnum("scenario_status", SCENARIO_STATUSES);
export const callerGender = pgEnum("caller_gender", CALLER_GENDERS);
export const authoringSource = pgEnum("authoring_source", AUTHORING_SOURCES);
export const factSeverity = pgEnum("fact_severity", FACT_SEVERITIES);
export const incidentCardField = pgEnum(
  "incident_card_field",
  INCIDENT_CARD_FIELDS,
);
export const terrainType = pgEnum("terrain_type", TERRAIN_TYPES);
export const locatorAccuracy = pgEnum("locator_accuracy", LOCATOR_ACCURACIES);
export const emergencyService = pgEnum("emergency_service", EMERGENCY_SERVICES);
export const referenceComparison = pgEnum(
  "reference_comparison",
  REFERENCE_COMPARISONS,
);
export const escalationTrigger = pgEnum(
  "escalation_trigger",
  ESCALATION_TRIGGERS,
);
export const escalationDirection = pgEnum(
  "escalation_direction",
  ESCALATION_DIRECTIONS,
);

export type ScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];
export type CallerGenderValue = (typeof CALLER_GENDERS)[number];
export type AuthoringSource = (typeof AUTHORING_SOURCES)[number];
export type FactSeverity = (typeof FACT_SEVERITIES)[number];
export type IncidentCardField = (typeof INCIDENT_CARD_FIELDS)[number];
export type TerrainType = (typeof TERRAIN_TYPES)[number];
export type LocatorAccuracy = (typeof LOCATOR_ACCURACIES)[number];
export type EmergencyService = (typeof EMERGENCY_SERVICES)[number];
export type ReferenceComparison = (typeof REFERENCE_COMPARISONS)[number];
export type EscalationTrigger = (typeof ESCALATION_TRIGGERS)[number];
export type EscalationDirection = (typeof ESCALATION_DIRECTIONS)[number];

/**
 * Кто звонит: половина полей уходит в промпт, половина — в синтез речи.
 *
 * Строка принадлежит одной версии сценария и после публикации не меняется:
 * правка персонажа порождает новую строку вместе с новой версией. Код поэтому
 * повторяется у всех версий одного сценария и уникальным быть не может.
 */
export const callerPersonas = pgTable(
  "caller_personas",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    ageYears: smallint("age_years").notNull(),
    /** Голос обязан совпадать с тем, кого играет сценарий. */
    gender: callerGender("gender").notNull(),
    condition: text("condition").notNull(),
    speechStyle: text("speech_style").notNull(),
    backgroundSounds: text("background_sounds"),
    voiceId: text("voice_id").notNull(),
    baselinePanicLevel: smallint("baseline_panic_level").notNull().default(1),
    baseSpeechRate: numeric("base_speech_rate", { precision: 3, scale: 2 })
      .notNull()
      .default("1.00"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("caller_personas_code_idx").on(table.code)],
);

/** Единица каталога: то, что преподаватель видит в списке и назначает. */
export const scenarios = pgTable(
  "scenarios",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    category: scenarioCategory("category").notNull(),
    difficulty: smallint("difficulty").notNull(),
    summary: text("summary").notNull(),
    status: scenarioStatus("status").notNull().default("draft"),
    // Сценарий переживает увольнение автора, поэтому связь рвётся, а не каскадит.
    authorId: text("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("scenarios_code_unique_idx").on(table.code),
    index("scenarios_status_idx").on(table.status),
  ],
);

/**
 * Неизменяемый снимок правил. Завершённая сессия ссылается именно сюда, поэтому
 * после публикации строка не меняется — правка порождает новую версию.
 */
export const scenarioVersions = pgTable(
  "scenario_versions",
  {
    id: text("id").primaryKey(),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "cascade" }),
    version: smallint("version").notNull(),
    personaId: text("persona_id")
      .notNull()
      .references(() => callerPersonas.id, { onDelete: "restrict" }),
    /** Границы шкалы: за них состояние заявителя не выходит. */
    panicFloor: smallint("panic_floor").notNull().default(0),
    panicCeiling: smallint("panic_ceiling").notNull().default(4),
    maxInterruptions: smallint("max_interruptions").notNull().default(3),
    initiativeCooldownSeconds: smallint("initiative_cooldown_seconds")
      .notNull()
      .default(12),
    /** Норматив приёма вызова: четыре минуты из предупреждения в АРМ. */
    answerNormSeconds: integer("answer_norm_seconds").notNull().default(240),
    expectedDurationSeconds: integer("expected_duration_seconds")
      .notNull()
      .default(360),
    passThreshold: smallint("pass_threshold").notNull().default(75),
    expectedServices: emergencyService("expected_services")
      .array()
      .notNull()
      .default([]),
    referenceNotes: text("reference_notes"),
    /** Первая реплика задаётся, а не генерируется: начало должно повторяться. */
    openingLine: text("opening_line").notNull(),
    /** Реплика на случай недоступной модели; фактов не раскрывает. */
    fallbackLine: text("fallback_line").notNull(),
    authoringSource: authoringSource("authoring_source")
      .notNull()
      .default("manual"),
    /**
     * Отпечаток исходного файла сценария.
     *
     * По нему сид отличает «файл не менялся» от «нужна новая версия». У
     * версии, набранной руками, его нет — и это правильно: сравнивать её не
     * с чем.
     */
    seedHash: text("seed_hash"),
    authoringPrompt: text("authoring_prompt"),
    reviewedBy: text("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: text("published_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("scenario_versions_scenario_version_unique_idx").on(
      table.scenarioId,
      table.version,
    ),
    index("scenario_versions_scenario_id_idx").on(table.scenarioId),
  ],
);

/**
 * Истинная точка происшествия и то, что о ней «знает» сеть.
 *
 * Центр круга автоопределения намеренно смещён от истинной точки: если он
 * совпадает с адресом, оператор читает координату из панели и не задаёт ни
 * одного вопроса.
 */
export const scenarioLocations = pgTable("scenario_locations", {
  scenarioVersionId: text("scenario_version_id")
    .primaryKey()
    .references(() => scenarioVersions.id, { onDelete: "cascade" }),
  terrain: terrainType("terrain").notNull(),
  exactAddress: jsonb("exact_address")
    .$type<Record<string, string>>()
    .notNull(),
  exactLat: numeric("exact_lat", { precision: 9, scale: 6 }).notNull(),
  exactLon: numeric("exact_lon", { precision: 9, scale: 6 }).notNull(),
  locatorCenterLat: numeric("locator_center_lat", {
    precision: 9,
    scale: 6,
  }).notNull(),
  locatorCenterLon: numeric("locator_center_lon", {
    precision: 9,
    scale: 6,
  }).notNull(),
  locatorRadiusMeters: integer("locator_radius_meters").notNull(),
  locatorLabel: text("locator_label").notNull(),
  locatorAccuracy: locatorAccuracy("locator_accuracy")
    .notNull()
    .default("identified"),
  callerNumber: text("caller_number").notNull(),
  previouslyCalled: boolean("previously_called").notNull().default(false),
});

/** Единица истины: одна вещь, которую заявитель может сообщить. */
export const scenarioFacts = pgTable(
  "scenario_facts",
  {
    id: text("id").primaryKey(),
    scenarioVersionId: text("scenario_version_id")
      .notNull()
      .references(() => scenarioVersions.id, { onDelete: "cascade" }),
    /** Формат совпадает с FactIdSchema: ключ ездит в revealedFactIds. */
    key: text("key").notNull(),
    promptValue: text("prompt_value").notNull(),
    displayLabel: text("display_label").notNull(),
    severity: factSeverity("severity").notNull().default("normal"),
    cardField: incidentCardField("card_field"),
    cardValue: text("card_value"),
    /**
     * Слова, по которым слышно, что факт прозвучал.
     *
     * Модель называет раскрытые факты сама, но регулярно забывает это сделать,
     * и тогда сказанное вслух не попадает в журнал. Ключевые слова пишет автор
     * сценария, поэтому проверка остаётся детерминированной.
     */
    contentKeywords: text("content_keywords").array().notNull().default([]),
    /** Размеченный union условия раскрытия. */
    disclosure: jsonb("disclosure").$type<Record<string, unknown>>().notNull(),
    /** Кого выбрать, когда условий выполнено больше, чем бюджет хода. */
    priority: smallint("priority").notNull().default(0),
    orderIndex: smallint("order_index").notNull().default(0),
  },
  (table) => [
    uniqueIndex("scenario_facts_version_key_unique_idx").on(
      table.scenarioVersionId,
      table.key,
    ),
  ],
);

/** Правила движения по шкале состояния для конкретной версии. */
export const escalationRules = pgTable(
  "escalation_rules",
  {
    id: text("id").primaryKey(),
    scenarioVersionId: text("scenario_version_id")
      .notNull()
      .references(() => scenarioVersions.id, { onDelete: "cascade" }),
    trigger: escalationTrigger("trigger").notNull(),
    direction: escalationDirection("direction").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>(),
    cooldownSeconds: smallint("cooldown_seconds").notNull().default(10),
  },
  (table) => [
    index("escalation_rules_version_idx").on(table.scenarioVersionId),
  ],
);

/** Чек-лист правой панели АРМ: закрывается фактами, а не текстом реплик. */
export const mandatoryQuestions = pgTable(
  "mandatory_questions",
  {
    id: text("id").primaryKey(),
    scenarioVersionId: text("scenario_version_id")
      .notNull()
      .references(() => scenarioVersions.id, { onDelete: "cascade" }),
    orderIndex: smallint("order_index").notNull(),
    text: text("text").notNull(),
    satisfiedByFactKeys: text("satisfied_by_fact_keys").array().notNull(),
    isCritical: boolean("is_critical").notNull().default(false),
  },
  (table) => [
    index("mandatory_questions_version_idx").on(table.scenarioVersionId),
  ],
);

/** Эталонная анкета: с чем оценка сверяет заполненную оператором карточку. */
export const referenceCardFields = pgTable(
  "reference_card_fields",
  {
    id: text("id").primaryKey(),
    scenarioVersionId: text("scenario_version_id")
      .notNull()
      .references(() => scenarioVersions.id, { onDelete: "cascade" }),
    field: incidentCardField("field").notNull(),
    expectedValue: text("expected_value").notNull(),
    acceptableValues: text("acceptable_values").array().notNull().default([]),
    comparison: referenceComparison("comparison")
      .notNull()
      .default("normalized"),
    isRequired: boolean("is_required").notNull().default(true),
    /** Замыкает цепочку «факт прозвучал → внесён в карточку → совпал». */
    sourceFactKey: text("source_fact_key"),
  },
  (table) => [
    uniqueIndex("reference_card_fields_version_field_unique_idx").on(
      table.scenarioVersionId,
      table.field,
    ),
  ],
);

export type CallerPersonaRecord = typeof callerPersonas.$inferSelect;
export type NewCallerPersonaRecord = typeof callerPersonas.$inferInsert;
export type ScenarioRecord = typeof scenarios.$inferSelect;
export type NewScenarioRecord = typeof scenarios.$inferInsert;
export type ScenarioVersionRecord = typeof scenarioVersions.$inferSelect;
export type NewScenarioVersionRecord = typeof scenarioVersions.$inferInsert;
export type ScenarioLocationRecord = typeof scenarioLocations.$inferSelect;
export type NewScenarioLocationRecord = typeof scenarioLocations.$inferInsert;
export type ScenarioFactRecord = typeof scenarioFacts.$inferSelect;
export type NewScenarioFactRecord = typeof scenarioFacts.$inferInsert;
export type EscalationRuleRecord = typeof escalationRules.$inferSelect;
export type NewEscalationRuleRecord = typeof escalationRules.$inferInsert;
export type MandatoryQuestionRecord = typeof mandatoryQuestions.$inferSelect;
export type NewMandatoryQuestionRecord = typeof mandatoryQuestions.$inferInsert;
export type ReferenceCardFieldRecord = typeof referenceCardFields.$inferSelect;
export type NewReferenceCardFieldRecord =
  typeof referenceCardFields.$inferInsert;
