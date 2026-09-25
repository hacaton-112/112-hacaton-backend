-- Two feature migrations were once appended to the journal with an older,
-- duplicate timestamp. Drizzle correctly considered them already passed on an
-- existing installation. Keep this repair forward-only and idempotent so it
-- converges both affected databases and databases where the DDL was applied
-- manually.
CREATE TABLE IF NOT EXISTS "methodical_materials" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "audience" text NOT NULL,
  "duration_minutes" integer NOT NULL,
  "roles" jsonb NOT NULL,
  "sections" jsonb NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'methodical_materials_created_by_users_id_fk'
      AND conrelid = 'methodical_materials'::regclass
  ) THEN
    ALTER TABLE "methodical_materials"
      ADD CONSTRAINT "methodical_materials_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "methodical_materials_updated_idx"
  ON "methodical_materials" USING btree ("updated_at");
--> statement-breakpoint
ALTER TABLE "dds_crew_calls"
  ADD COLUMN IF NOT EXISTS "transcript" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "dds_crew_calls"
  ADD COLUMN IF NOT EXISTS "validation" jsonb;
--> statement-breakpoint
ALTER TABLE "dds_crew_calls"
  ADD COLUMN IF NOT EXISTS "asr_status" text DEFAULT 'not_started' NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dds_crew_calls_asr_status_check'
      AND conrelid = 'dds_crew_calls'::regclass
  ) THEN
    ALTER TABLE "dds_crew_calls"
      ADD CONSTRAINT "dds_crew_calls_asr_status_check"
      CHECK ("asr_status" IN ('not_started', 'completed', 'unavailable'));
  END IF;
END $$;
