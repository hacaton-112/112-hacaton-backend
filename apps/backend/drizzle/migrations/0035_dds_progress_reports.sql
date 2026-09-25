ALTER TABLE "dds_crew_calls" ADD COLUMN "purpose" text DEFAULT 'handoff' NOT NULL;--> statement-breakpoint
ALTER TABLE "dds_crew_calls" ADD COLUMN "reported_status" text;--> statement-breakpoint
ALTER TABLE "dds_crew_calls" ADD COLUMN "report_text" text;--> statement-breakpoint
ALTER TABLE "dds_crew_call_commands" ADD COLUMN "purpose" text DEFAULT 'handoff' NOT NULL;--> statement-breakpoint
ALTER TABLE "dds_crew_call_commands" ADD COLUMN "reported_status" text;--> statement-breakpoint
ALTER TABLE "dds_crew_calls" ADD CONSTRAINT "dds_crew_calls_purpose_check" CHECK ("purpose" IN ('handoff', 'progress_check'));--> statement-breakpoint
ALTER TABLE "dds_crew_calls" ADD CONSTRAINT "dds_crew_calls_reported_status_check" CHECK (("purpose" = 'handoff' AND "reported_status" IS NULL) OR ("purpose" = 'progress_check' AND "reported_status" IN ('arrived', 'working', 'completed')));
--> statement-breakpoint
ALTER TABLE "dds_crew_call_commands" ADD CONSTRAINT "dds_crew_call_commands_purpose_check" CHECK ("purpose" IN ('handoff', 'progress_check'));
--> statement-breakpoint
ALTER TABLE "dds_crew_call_commands" ADD CONSTRAINT "dds_crew_call_commands_reported_status_check" CHECK (("purpose" = 'handoff' AND "reported_status" IS NULL) OR ("purpose" = 'progress_check' AND "reported_status" IN ('arrived', 'working', 'completed')));
