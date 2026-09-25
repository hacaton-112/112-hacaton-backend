ALTER TABLE "dds_crew_calls" ADD COLUMN "transcript" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "dds_crew_calls" ADD COLUMN "validation" jsonb;--> statement-breakpoint
ALTER TABLE "dds_crew_calls" ADD COLUMN "asr_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "dds_crew_calls" ADD CONSTRAINT "dds_crew_calls_asr_status_check" CHECK ("asr_status" IN ('not_started', 'completed', 'unavailable'));
