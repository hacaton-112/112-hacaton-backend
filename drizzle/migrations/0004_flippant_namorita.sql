CREATE TYPE "public"."call_event_actor" AS ENUM('operator', 'caller', 'instructor', 'system');--> statement-breakpoint
CREATE TYPE "public"."call_event_type" AS ENUM('call.offered', 'call.accepted', 'call.declined', 'operator.utterance', 'caller.reply', 'panic.changed', 'caller.initiative', 'caller.interrupted', 'fact.revealed', 'fact.rejected', 'stage.changed', 'instructor.intervened', 'call.ended');--> statement-breakpoint
CREATE TYPE "public"."call_stage" AS ENUM('offered', 'conversation', 'wrap_up', 'ended', 'declined');--> statement-breakpoint
CREATE TYPE "public"."authoring_source" AS ENUM('manual', 'assistant', 'imported');--> statement-breakpoint
CREATE TYPE "public"."emergency_service" AS ENUM('fire', 'police', 'ambulance', 'gas');--> statement-breakpoint
CREATE TYPE "public"."escalation_direction" AS ENUM('up', 'down');--> statement-breakpoint
CREATE TYPE "public"."escalation_trigger" AS ENUM('operator_silence', 'question_repeated', 'heavy_fact_revealed', 'norm_time_elapsed', 'forbidden_phrase', 'calming_phrase', 'services_confirmed', 'instruction_followed');--> statement-breakpoint
CREATE TYPE "public"."fact_severity" AS ENUM('normal', 'heavy');--> statement-breakpoint
CREATE TYPE "public"."incident_card_field" AS ENUM('city', 'street', 'house', 'entrance', 'floor', 'apartment', 'object_type', 'landmarks', 'caller_name', 'caller_phone', 'caller_type', 'dispatcher_notes', 'category', 'clarification', 'started_at', 'victims_total', 'children_count', 'victims_condition');--> statement-breakpoint
CREATE TYPE "public"."locator_accuracy" AS ENUM('identified', 'approximate', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."reference_comparison" AS ENUM('exact', 'normalized', 'numeric_range', 'contains');--> statement-breakpoint
CREATE TYPE "public"."scenario_category" AS ENUM('fire', 'road_accident', 'medical', 'criminal', 'gas_leak', 'other');--> statement-breakpoint
CREATE TYPE "public"."scenario_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."terrain_type" AS ENUM('city_dense', 'city_block', 'highway', 'open_field', 'forest', 'indoor');--> statement-breakpoint
CREATE TABLE "call_events" (
	"id" text PRIMARY KEY NOT NULL,
	"training_session_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"type" "call_event_type" NOT NULL,
	"actor" "call_event_actor" NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_states" (
	"training_session_id" text PRIMARY KEY NOT NULL,
	"scenario_version_id" text NOT NULL,
	"stage" "call_stage" DEFAULT 'offered' NOT NULL,
	"panic_level" smallint NOT NULL,
	"panic_changed_at" timestamp with time zone,
	"rng_seed" text NOT NULL,
	"interruptions_used" smallint DEFAULT 0 NOT NULL,
	"last_initiative_at" timestamp with time zone,
	"operator_silence_since" timestamp with time zone,
	"revealed_fact_keys" text[] DEFAULT '{}' NOT NULL,
	"caller_turns" smallint DEFAULT 0 NOT NULL,
	"offered_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"last_sequence" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caller_personas" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"age_years" smallint NOT NULL,
	"condition" text NOT NULL,
	"speech_style" text NOT NULL,
	"background_sounds" text,
	"voice_id" text NOT NULL,
	"baseline_panic_level" smallint DEFAULT 1 NOT NULL,
	"base_speech_rate" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_version_id" text NOT NULL,
	"trigger" "escalation_trigger" NOT NULL,
	"direction" "escalation_direction" NOT NULL,
	"params" jsonb,
	"cooldown_seconds" smallint DEFAULT 10 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mandatory_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_version_id" text NOT NULL,
	"order_index" smallint NOT NULL,
	"text" text NOT NULL,
	"satisfied_by_fact_keys" text[] NOT NULL,
	"is_critical" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_card_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_version_id" text NOT NULL,
	"field" "incident_card_field" NOT NULL,
	"expected_value" text NOT NULL,
	"acceptable_values" text[] DEFAULT '{}' NOT NULL,
	"comparison" "reference_comparison" DEFAULT 'normalized' NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"source_fact_key" text
);
--> statement-breakpoint
CREATE TABLE "scenario_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_version_id" text NOT NULL,
	"key" text NOT NULL,
	"prompt_value" text NOT NULL,
	"display_label" text NOT NULL,
	"severity" "fact_severity" DEFAULT 'normal' NOT NULL,
	"card_field" "incident_card_field",
	"card_value" text,
	"disclosure" jsonb NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"order_index" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_locations" (
	"scenario_version_id" text PRIMARY KEY NOT NULL,
	"terrain" "terrain_type" NOT NULL,
	"exact_address" jsonb NOT NULL,
	"exact_lat" numeric(9, 6) NOT NULL,
	"exact_lon" numeric(9, 6) NOT NULL,
	"locator_center_lat" numeric(9, 6) NOT NULL,
	"locator_center_lon" numeric(9, 6) NOT NULL,
	"locator_radius_meters" integer NOT NULL,
	"locator_label" text NOT NULL,
	"locator_accuracy" "locator_accuracy" DEFAULT 'identified' NOT NULL,
	"caller_number" text NOT NULL,
	"previously_called" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"version" smallint NOT NULL,
	"persona_id" text NOT NULL,
	"panic_floor" smallint DEFAULT 0 NOT NULL,
	"panic_ceiling" smallint DEFAULT 4 NOT NULL,
	"max_interruptions" smallint DEFAULT 3 NOT NULL,
	"initiative_cooldown_seconds" smallint DEFAULT 12 NOT NULL,
	"answer_norm_seconds" integer DEFAULT 240 NOT NULL,
	"expected_duration_seconds" integer DEFAULT 360 NOT NULL,
	"pass_threshold" smallint DEFAULT 75 NOT NULL,
	"expected_services" "emergency_service"[] DEFAULT '{}' NOT NULL,
	"reference_notes" text,
	"opening_line" text NOT NULL,
	"fallback_line" text NOT NULL,
	"authoring_source" "authoring_source" DEFAULT 'manual' NOT NULL,
	"authoring_prompt" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"category" "scenario_category" NOT NULL,
	"difficulty" smallint NOT NULL,
	"summary" text NOT NULL,
	"status" "scenario_status" DEFAULT 'draft' NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_states" ADD CONSTRAINT "call_states_scenario_version_id_scenario_versions_id_fk" FOREIGN KEY ("scenario_version_id") REFERENCES "public"."scenario_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_scenario_version_id_scenario_versions_id_fk" FOREIGN KEY ("scenario_version_id") REFERENCES "public"."scenario_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandatory_questions" ADD CONSTRAINT "mandatory_questions_scenario_version_id_scenario_versions_id_fk" FOREIGN KEY ("scenario_version_id") REFERENCES "public"."scenario_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_card_fields" ADD CONSTRAINT "reference_card_fields_scenario_version_id_scenario_versions_id_fk" FOREIGN KEY ("scenario_version_id") REFERENCES "public"."scenario_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_facts" ADD CONSTRAINT "scenario_facts_scenario_version_id_scenario_versions_id_fk" FOREIGN KEY ("scenario_version_id") REFERENCES "public"."scenario_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_locations" ADD CONSTRAINT "scenario_locations_scenario_version_id_scenario_versions_id_fk" FOREIGN KEY ("scenario_version_id") REFERENCES "public"."scenario_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_versions" ADD CONSTRAINT "scenario_versions_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_versions" ADD CONSTRAINT "scenario_versions_persona_id_caller_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."caller_personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_versions" ADD CONSTRAINT "scenario_versions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_versions" ADD CONSTRAINT "scenario_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_events_session_sequence_unique_idx" ON "call_events" USING btree ("training_session_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "call_events_session_event_unique_idx" ON "call_events" USING btree ("training_session_id","event_id");--> statement-breakpoint
CREATE INDEX "call_events_session_idx" ON "call_events" USING btree ("training_session_id");--> statement-breakpoint
CREATE INDEX "call_states_scenario_version_idx" ON "call_states" USING btree ("scenario_version_id");--> statement-breakpoint
CREATE INDEX "call_states_stage_idx" ON "call_states" USING btree ("stage");--> statement-breakpoint
CREATE UNIQUE INDEX "caller_personas_code_unique_idx" ON "caller_personas" USING btree ("code");--> statement-breakpoint
CREATE INDEX "escalation_rules_version_idx" ON "escalation_rules" USING btree ("scenario_version_id");--> statement-breakpoint
CREATE INDEX "mandatory_questions_version_idx" ON "mandatory_questions" USING btree ("scenario_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_card_fields_version_field_unique_idx" ON "reference_card_fields" USING btree ("scenario_version_id","field");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_facts_version_key_unique_idx" ON "scenario_facts" USING btree ("scenario_version_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_versions_scenario_version_unique_idx" ON "scenario_versions" USING btree ("scenario_id","version");--> statement-breakpoint
CREATE INDEX "scenario_versions_scenario_id_idx" ON "scenario_versions" USING btree ("scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scenarios_code_unique_idx" ON "scenarios" USING btree ("code");--> statement-breakpoint
CREATE INDEX "scenarios_status_idx" ON "scenarios" USING btree ("status");