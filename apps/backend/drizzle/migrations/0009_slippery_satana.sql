CREATE TABLE "call_evaluations" (
	"training_session_id" text PRIMARY KEY NOT NULL,
	"scenario_version_id" text NOT NULL,
	"score" smallint NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_evaluations" ADD CONSTRAINT "call_evaluations_training_session_id_call_states_training_session_id_fk" FOREIGN KEY ("training_session_id") REFERENCES "public"."call_states"("training_session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_evaluations" ADD CONSTRAINT "call_evaluations_scenario_version_id_scenario_versions_id_fk" FOREIGN KEY ("scenario_version_id") REFERENCES "public"."scenario_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_evaluations_version_idx" ON "call_evaluations" USING btree ("scenario_version_id");