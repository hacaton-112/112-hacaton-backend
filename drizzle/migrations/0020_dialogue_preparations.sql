CREATE TABLE "dialogue_preparations" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL REFERENCES "public"."users"("id"),
  "snapshot_hash" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "authoring_source" text DEFAULT 'manual' NOT NULL,
  "authoring_prompt" text,
  "revision" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "assets" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "completed" integer DEFAULT 0 NOT NULL,
  "total" integer DEFAULT 0 NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "approved_at" timestamp with time zone,
  "lease_token" text,
  "lease_until" timestamp with time zone,
  "error" text,
  "scenario_version_id" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dialogue_preparation_owner_snapshot_idx" ON "dialogue_preparations" ("owner_id", "snapshot_hash");
--> statement-breakpoint
ALTER TABLE "scenario_audio_packs" ADD COLUMN "entries" jsonb DEFAULT '[]'::jsonb NOT NULL;
