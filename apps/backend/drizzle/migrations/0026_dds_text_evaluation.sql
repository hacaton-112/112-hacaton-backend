CREATE TYPE "dds_reference_status" AS ENUM ('draft', 'approved');
--> statement-breakpoint
CREATE TYPE "dds_expected_outcome" AS ENUM ('accept', 'refuse');
--> statement-breakpoint
CREATE TYPE "dds_text_evaluation_status" AS ENUM ('pending', 'done', 'failed', 'skipped');
--> statement-breakpoint
CREATE TABLE "dds_card_references" (
  "id" text PRIMARY KEY NOT NULL,
  "scenario_version_id" text,
  "exercise_id" text,
  "expected_outcome" "dds_expected_outcome" NOT NULL,
  "refusal_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "required_items" jsonb NOT NULL,
  "expected_crew_service" "dispatch_service",
  "status" "dds_reference_status" DEFAULT 'draft' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "generation_comment" text,
  "lease_owner" text,
  "lease_until" timestamp with time zone,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "dds_card_references_one_source_check" CHECK (("scenario_version_id" is not null) <> ("exercise_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "dds_text_evaluations" (
  "id" text PRIMARY KEY NOT NULL,
  "exercise_id" text NOT NULL,
  "status" "dds_text_evaluation_status" DEFAULT 'pending' NOT NULL,
  "reference_version" integer,
  "coverage" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "contradictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "summary" text,
  "grammar" jsonb,
  "model" text,
  "duration_ms" integer,
  "error" text,
  "lease_owner" text,
  "lease_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dds_card_references" ADD CONSTRAINT "dds_card_references_scenario_version_id_scenario_versions_id_fk" FOREIGN KEY ("scenario_version_id") REFERENCES "public"."scenario_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dds_card_references" ADD CONSTRAINT "dds_card_references_exercise_id_dds_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."dds_exercises"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dds_card_references" ADD CONSTRAINT "dds_card_references_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dds_text_evaluations" ADD CONSTRAINT "dds_text_evaluations_exercise_id_dds_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."dds_exercises"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "dds_card_references_scenario_unique_idx" ON "dds_card_references" ("scenario_version_id") WHERE "scenario_version_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "dds_card_references_exercise_unique_idx" ON "dds_card_references" ("exercise_id") WHERE "exercise_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "dds_card_references_status_idx" ON "dds_card_references" ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "dds_text_evaluations_exercise_unique_idx" ON "dds_text_evaluations" ("exercise_id");
--> statement-breakpoint
CREATE INDEX "dds_text_evaluations_status_idx" ON "dds_text_evaluations" ("status");
