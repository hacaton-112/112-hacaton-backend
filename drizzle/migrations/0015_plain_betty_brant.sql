CREATE TYPE "public"."dds_response_status" AS ENUM('pending', 'accepted', 'not_accepted', 'responding', 'arrived', 'working', 'completed', 'refused');--> statement-breakpoint
CREATE TABLE "dds_exercise_events" (
	"id" text PRIMARY KEY NOT NULL,
	"exercise_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"event_id" text NOT NULL,
	"from_status" "dds_response_status",
	"to_status" "dds_response_status" NOT NULL,
	"actor_id" text,
	"comment" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dds_exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_version_id" text NOT NULL,
	"operator_id" text,
	"training_attempt_id" text,
	"addressed_service" "dispatch_service" NOT NULL,
	"status" "dds_response_status" DEFAULT 'pending' NOT NULL,
	"card" jsonb NOT NULL,
	"acknowledgement_deadline_at" timestamp with time zone NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_sequence" integer DEFAULT 1 NOT NULL,
	"score" smallint,
	"passed" boolean,
	"start_event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dds_exercise_events" ADD CONSTRAINT "dds_exercise_events_exercise_id_dds_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."dds_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dds_exercise_events" ADD CONSTRAINT "dds_exercise_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dds_exercises" ADD CONSTRAINT "dds_exercises_scenario_version_id_scenario_versions_id_fk" FOREIGN KEY ("scenario_version_id") REFERENCES "public"."scenario_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dds_exercises" ADD CONSTRAINT "dds_exercises_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dds_exercise_events_sequence_unique_idx" ON "dds_exercise_events" USING btree ("exercise_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "dds_exercise_events_event_unique_idx" ON "dds_exercise_events" USING btree ("exercise_id","event_id");--> statement-breakpoint
CREATE INDEX "dds_exercise_events_exercise_idx" ON "dds_exercise_events" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dds_exercises_operator_start_event_unique_idx" ON "dds_exercises" USING btree ("operator_id","start_event_id");--> statement-breakpoint
CREATE INDEX "dds_exercises_operator_created_idx" ON "dds_exercises" USING btree ("operator_id","created_at");--> statement-breakpoint
CREATE INDEX "dds_exercises_status_idx" ON "dds_exercises" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dds_exercises_training_attempt_idx" ON "dds_exercises" USING btree ("training_attempt_id");