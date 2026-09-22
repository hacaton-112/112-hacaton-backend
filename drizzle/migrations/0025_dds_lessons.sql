ALTER TYPE "dds_response_status" ADD VALUE IF NOT EXISTS 'lesson_finished';
--> statement-breakpoint
CREATE TYPE "dds_lesson_status" AS ENUM ('active', 'finished');
--> statement-breakpoint
CREATE TYPE "dds_lesson_card_source" AS ENUM ('generated', 'operator_call', 'mixed');
--> statement-breakpoint
CREATE TABLE "dds_lessons" (
  "id" text PRIMARY KEY NOT NULL,
  "created_by" text NOT NULL,
  "group_id" text,
  "target_user_id" text,
  "title" text NOT NULL,
  "categories" "scenario_category"[] NOT NULL,
  "card_source" "dds_lesson_card_source" NOT NULL,
  "acknowledgement_norm_seconds" integer DEFAULT 30 NOT NULL,
  "pass_threshold" smallint DEFAULT 75 NOT NULL,
  "status" "dds_lesson_status" DEFAULT 'active' NOT NULL,
  "start_event_id" text NOT NULL,
  "finish_event_id" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "finished_by" text,
  CONSTRAINT "dds_lessons_one_target_check" CHECK (("group_id" is not null) <> ("target_user_id" is not null)),
  CONSTRAINT "dds_lessons_categories_nonempty_check" CHECK (cardinality("categories") > 0),
  CONSTRAINT "dds_lessons_acknowledgement_norm_check" CHECK ("acknowledgement_norm_seconds" between 10 and 300),
  CONSTRAINT "dds_lessons_pass_threshold_check" CHECK ("pass_threshold" between 50 and 100)
);
--> statement-breakpoint
ALTER TABLE "dds_lessons" ADD CONSTRAINT "dds_lessons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dds_lessons" ADD CONSTRAINT "dds_lessons_group_id_training_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."training_groups"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dds_lessons" ADD CONSTRAINT "dds_lessons_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dds_lessons" ADD CONSTRAINT "dds_lessons_finished_by_users_id_fk" FOREIGN KEY ("finished_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "dds_lessons_creator_start_event_unique_idx" ON "dds_lessons" USING btree ("created_by", "start_event_id");
--> statement-breakpoint
CREATE INDEX "dds_lessons_group_idx" ON "dds_lessons" USING btree ("group_id");
--> statement-breakpoint
CREATE INDEX "dds_lessons_target_user_idx" ON "dds_lessons" USING btree ("target_user_id");
--> statement-breakpoint
CREATE INDEX "dds_lessons_status_idx" ON "dds_lessons" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "dds_exercises" ADD COLUMN "lesson_id" text;
--> statement-breakpoint
ALTER TABLE "dds_exercises" ADD CONSTRAINT "dds_exercises_lesson_id_dds_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."dds_lessons"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "dds_exercises_lesson_idx" ON "dds_exercises" USING btree ("lesson_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "dds_exercises_lesson_operator_active_unique_idx" ON "dds_exercises" USING btree ("lesson_id", "operator_id") WHERE "lesson_id" IS NOT NULL AND "completed_at" IS NULL;
