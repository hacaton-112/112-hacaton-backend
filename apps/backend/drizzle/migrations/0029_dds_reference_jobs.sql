CREATE TYPE "public"."dds_reference_job_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
ALTER TABLE "dds_card_references" ADD COLUMN "job_status" "dds_reference_job_status" DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE "dds_text_evaluations" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "dds_card_references_job_lease_idx" ON "dds_card_references" USING btree ("job_status", "lease_until");
