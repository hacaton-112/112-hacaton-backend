CREATE TABLE "scenario_audio_packs" (
	"scenario_version_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"assets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenario_audio_packs" ADD CONSTRAINT "scenario_audio_packs_scenario_version_id_scenario_versions_id_fk" FOREIGN KEY ("scenario_version_id") REFERENCES "public"."scenario_versions"("id") ON DELETE cascade ON UPDATE no action;
