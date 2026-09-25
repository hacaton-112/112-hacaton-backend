import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./user.schema";

export const CLASSIFIER_VERSION_STATUSES = [
  "draft",
  "active",
  "superseded",
] as const;
export const CLASSIFIER_RULE_MODES = ["always", "default", "selected"] as const;

export type ClassifierVersionStatus =
  (typeof CLASSIFIER_VERSION_STATUSES)[number];
export type ClassifierRuleMode = (typeof CLASSIFIER_RULE_MODES)[number];

export interface ClassifierImportWarning {
  readonly code: "missing_ekp_type" | "missing_main_service";
  readonly row: number;
  readonly column: string;
  readonly message: string;
}

export interface ClassifierRequiredServiceSnapshot {
  readonly code: string;
  readonly name: string;
  readonly routeLabel: string;
}

/**
 * What was deterministically selected for an incident card.
 *
 * The snapshot deliberately repeats labels from the immutable classifier
 * version. A completed call can therefore be rendered without rerunning newer
 * routing rules.
 */
export interface ClassifierRoutingSnapshot {
  readonly classifierVersionId: string;
  readonly classifierEntryId: string;
  readonly sourceCode: string;
  readonly featurePath: readonly string[];
  readonly finalType: string;
  readonly ekpType: string | null;
  readonly mainServiceCode: string | null;
  readonly qualifierCodes: readonly string[];
  readonly requiredServices: readonly ClassifierRequiredServiceSnapshot[];
}

export const classifierVersionStatus = pgEnum(
  "classifier_version_status",
  CLASSIFIER_VERSION_STATUSES,
);
export const classifierRuleMode = pgEnum(
  "classifier_rule_mode",
  CLASSIFIER_RULE_MODES,
);

export const classifierVersions = pgTable(
  "classifier_versions",
  {
    id: text("id").primaryKey(),
    version: integer("version").notNull(),
    status: classifierVersionStatus("status").notNull().default("draft"),
    sourceFileName: text("source_file_name").notNull(),
    sourceSheet: text("source_sheet").notNull(),
    sourceSha256: text("source_sha256").notNull(),
    recordCount: integer("record_count").notNull(),
    warningCount: integer("warning_count").notNull(),
    warnings: jsonb("warnings")
      .$type<readonly ClassifierImportWarning[]>()
      .notNull()
      .default([]),
    importedBy: text("imported_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("classifier_versions_version_unique_idx").on(table.version),
    uniqueIndex("classifier_versions_sha_unique_idx").on(table.sourceSha256),
    uniqueIndex("classifier_versions_one_active_idx")
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
    index("classifier_versions_status_idx").on(table.status),
  ],
);

export const classifierEntries = pgTable(
  "classifier_entries",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id")
      .notNull()
      .references(() => classifierVersions.id, { onDelete: "cascade" }),
    sourceCode: text("source_code").notNull(),
    sourceRow: integer("source_row").notNull(),
    groupName: text("group_name"),
    statisticalGroup: text("statistical_group"),
    feature1: text("feature_1").notNull(),
    feature2: text("feature_2"),
    feature3: text("feature_3"),
    additionalSigns: text("additional_signs"),
    finalType: text("final_type").notNull(),
    ekpType: text("ekp_type"),
    mainServiceCode: text("main_service_code"),
    operatorVisible: boolean("operator_visible").notNull().default(true),
  },
  (table) => [
    uniqueIndex("classifier_entries_version_code_unique_idx").on(
      table.versionId,
      table.sourceCode,
    ),
    index("classifier_entries_version_idx").on(table.versionId),
    index("classifier_entries_final_type_idx").on(table.finalType),
  ],
);

export const classifierServices = pgTable(
  "classifier_services",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id")
      .notNull()
      .references(() => classifierVersions.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sourceHeader: text("source_header").notNull(),
  },
  (table) => [
    uniqueIndex("classifier_services_version_code_unique_idx").on(
      table.versionId,
      table.code,
    ),
    index("classifier_services_version_idx").on(table.versionId),
  ],
);

export const classifierRoutingRules = pgTable(
  "classifier_routing_rules",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id")
      .notNull()
      .references(() => classifierEntries.id, { onDelete: "cascade" }),
    serviceId: text("service_id")
      .notNull()
      .references(() => classifierServices.id, { onDelete: "cascade" }),
    mode: classifierRuleMode("mode").notNull(),
    qualifierCode: text("qualifier_code"),
    qualifierLabel: text("qualifier_label"),
    routeLabel: text("route_label").notNull(),
    sourceColumn: text("source_column").notNull(),
    orderIndex: integer("order_index").notNull(),
  },
  (table) => [
    uniqueIndex("classifier_rules_entry_column_unique_idx").on(
      table.entryId,
      table.sourceColumn,
    ),
    index("classifier_rules_entry_idx").on(table.entryId),
    index("classifier_rules_service_idx").on(table.serviceId),
  ],
);

export type ClassifierVersionRecord = typeof classifierVersions.$inferSelect;
export type ClassifierEntryRecord = typeof classifierEntries.$inferSelect;
export type ClassifierServiceRecord = typeof classifierServices.$inferSelect;
export type ClassifierRoutingRuleRecord =
  typeof classifierRoutingRules.$inferSelect;
