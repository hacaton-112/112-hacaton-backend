CREATE TYPE "public"."dds_insights_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "dds_lesson_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"status" "dds_insights_status" DEFAULT 'pending' NOT NULL,
	"strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weaknesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"focus_scenarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"model" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dds_lesson_insights" ADD CONSTRAINT "dds_lesson_insights_lesson_id_dds_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."dds_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dds_lesson_insights_lesson_unique_idx" ON "dds_lesson_insights" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "dds_lesson_insights_status_lease_idx" ON "dds_lesson_insights" USING btree ("status","lease_until");
