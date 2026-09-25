CREATE TABLE "dds_crew_call_commands" (
	"event_id" text PRIMARY KEY NOT NULL,
	"exercise_id" text NOT NULL,
	"operator_id" text NOT NULL,
	"caller_extension" text NOT NULL,
	"dialed_number" text NOT NULL,
	"channel_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dds_crew_call_commands" ADD CONSTRAINT "dds_crew_call_commands_exercise_id_dds_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."dds_exercises"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dds_crew_call_commands" ADD CONSTRAINT "dds_crew_call_commands_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "dds_crew_call_commands_channel_unique_idx" ON "dds_crew_call_commands" USING btree ("channel_id");
--> statement-breakpoint
CREATE INDEX "dds_crew_call_commands_exercise_idx" ON "dds_crew_call_commands" USING btree ("exercise_id");
