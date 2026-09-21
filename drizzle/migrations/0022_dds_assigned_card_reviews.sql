ALTER TABLE "dds_exercises" ADD COLUMN "pass_threshold" smallint DEFAULT 75 NOT NULL;
--> statement-breakpoint
CREATE TABLE "dds_exercise_reviews" (
  "id" text PRIMARY KEY NOT NULL,
  "exercise_id" text NOT NULL REFERENCES "dds_exercises"("id") ON DELETE CASCADE,
  "event_id" text NOT NULL,
  "instructor_id" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "score" smallint NOT NULL CHECK ("score" BETWEEN 0 AND 100),
  "comment" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dds_reviews_exercise_event_idx" ON "dds_exercise_reviews" ("exercise_id", "event_id");
