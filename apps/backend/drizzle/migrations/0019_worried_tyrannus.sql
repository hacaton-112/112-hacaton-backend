ALTER TABLE "dds_exercises" ADD COLUMN "source_training_session_id" text;--> statement-breakpoint
ALTER TABLE "dds_exercises" ADD CONSTRAINT "dds_exercises_source_training_session_id_incident_cards_training_session_id_fk" FOREIGN KEY ("source_training_session_id") REFERENCES "public"."incident_cards"("training_session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dds_exercises_source_service_unique_idx" ON "dds_exercises" USING btree ("source_training_session_id","addressed_service") WHERE "dds_exercises"."source_training_session_id" is not null;
