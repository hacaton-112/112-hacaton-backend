CREATE TYPE "public"."classifier_rule_mode" AS ENUM('always', 'default', 'selected');--> statement-breakpoint
CREATE TYPE "public"."classifier_version_status" AS ENUM('draft', 'active', 'superseded');--> statement-breakpoint
CREATE TABLE "classifier_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"version_id" text NOT NULL,
	"source_code" text NOT NULL,
	"source_row" integer NOT NULL,
	"group_name" text,
	"statistical_group" text,
	"feature_1" text NOT NULL,
	"feature_2" text,
	"feature_3" text,
	"additional_signs" text,
	"final_type" text NOT NULL,
	"ekp_type" text,
	"main_service_code" text,
	"operator_visible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classifier_routing_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"service_id" text NOT NULL,
	"mode" "classifier_rule_mode" NOT NULL,
	"qualifier_code" text,
	"qualifier_label" text,
	"route_label" text NOT NULL,
	"source_column" text NOT NULL,
	"order_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classifier_services" (
	"id" text PRIMARY KEY NOT NULL,
	"version_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"source_header" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classifier_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"status" "classifier_version_status" DEFAULT 'draft' NOT NULL,
	"source_file_name" text NOT NULL,
	"source_sheet" text NOT NULL,
	"source_sha256" text NOT NULL,
	"record_count" integer NOT NULL,
	"warning_count" integer NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"imported_by" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "incident_cards" ADD COLUMN "classifier_entry_id" text;--> statement-breakpoint
ALTER TABLE "incident_cards" ADD COLUMN "classifier_qualifier_codes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "incident_cards" ADD COLUMN "classifier_routing" jsonb;--> statement-breakpoint
ALTER TABLE "classifier_entries" ADD CONSTRAINT "classifier_entries_version_id_classifier_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."classifier_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifier_routing_rules" ADD CONSTRAINT "classifier_routing_rules_entry_id_classifier_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."classifier_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifier_routing_rules" ADD CONSTRAINT "classifier_routing_rules_service_id_classifier_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."classifier_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifier_services" ADD CONSTRAINT "classifier_services_version_id_classifier_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."classifier_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifier_versions" ADD CONSTRAINT "classifier_versions_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "classifier_entries_version_code_unique_idx" ON "classifier_entries" USING btree ("version_id","source_code");--> statement-breakpoint
CREATE INDEX "classifier_entries_version_idx" ON "classifier_entries" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "classifier_entries_final_type_idx" ON "classifier_entries" USING btree ("final_type");--> statement-breakpoint
CREATE UNIQUE INDEX "classifier_rules_entry_column_unique_idx" ON "classifier_routing_rules" USING btree ("entry_id","source_column");--> statement-breakpoint
CREATE INDEX "classifier_rules_entry_idx" ON "classifier_routing_rules" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "classifier_rules_service_idx" ON "classifier_routing_rules" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classifier_services_version_code_unique_idx" ON "classifier_services" USING btree ("version_id","code");--> statement-breakpoint
CREATE INDEX "classifier_services_version_idx" ON "classifier_services" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classifier_versions_version_unique_idx" ON "classifier_versions" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "classifier_versions_sha_unique_idx" ON "classifier_versions" USING btree ("source_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "classifier_versions_one_active_idx" ON "classifier_versions" USING btree ("status") WHERE "classifier_versions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "classifier_versions_status_idx" ON "classifier_versions" USING btree ("status");--> statement-breakpoint
ALTER TABLE "incident_cards" ADD CONSTRAINT "incident_cards_classifier_entry_id_classifier_entries_id_fk" FOREIGN KEY ("classifier_entry_id") REFERENCES "public"."classifier_entries"("id") ON DELETE restrict ON UPDATE no action;