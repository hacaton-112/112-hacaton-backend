CREATE TYPE "scenario_generation_status" AS ENUM ('queued', 'running', 'done', 'failed');
--> statement-breakpoint
CREATE TABLE "scenario_generation_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "created_by" text NOT NULL,
  "brief" text NOT NULL,
  "status" "scenario_generation_status" DEFAULT 'queued' NOT NULL,
  "attempts" smallint DEFAULT 0 NOT NULL,
  "lease_token" text,
  "lease_until" timestamp with time zone,
  "result" jsonb,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "scenario_generation_jobs" ADD CONSTRAINT "scenario_generation_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "scenario_generation_jobs_queue_idx" ON "scenario_generation_jobs" USING btree ("status", "created_at");
--> statement-breakpoint
CREATE INDEX "scenario_generation_jobs_owner_idx" ON "scenario_generation_jobs" USING btree ("created_by", "created_at");
