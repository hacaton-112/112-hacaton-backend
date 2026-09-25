DROP INDEX IF EXISTS "dds_exercises_operator_start_event_unique_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "dds_exercises_operator_start_event_unique_idx" ON "dds_exercises" USING btree ("operator_id","start_event_id") WHERE "source_training_session_id" IS NULL;
--> statement-breakpoint
UPDATE "dds_exercises" SET "training_attempt_id" = NULL WHERE "source_training_session_id" IS NOT NULL AND "training_attempt_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "dds_exercises" AS "e" SET "operator_id" = (
  SELECT "ev"."actor_id" FROM "dds_exercise_events" AS "ev"
  WHERE "ev"."exercise_id" = "e"."id" AND "ev"."sequence" > 1 AND "ev"."actor_id" IS NOT NULL
  ORDER BY "ev"."sequence" LIMIT 1
) WHERE "e"."operator_id" IS NULL AND "e"."source_training_session_id" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "dds_exercise_events" AS "ev"
  WHERE "ev"."exercise_id" = "e"."id" AND "ev"."sequence" > 1 AND "ev"."actor_id" IS NOT NULL
);
