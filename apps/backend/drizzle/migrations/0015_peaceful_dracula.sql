ALTER TABLE "call_states" ADD COLUMN "recovery_expires_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "call_states"
SET "recovery_expires_at" = now() + interval '30 seconds'
WHERE "stage" IN ('offered', 'conversation', 'wrap_up');
