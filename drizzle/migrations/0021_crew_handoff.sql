CREATE TYPE "public"."crew_call_outcome" AS ENUM('completed', 'abandoned', 'unknown_number');--> statement-breakpoint
CREATE TABLE "dds_crew_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"exercise_id" text,
	"crew_id" text,
	"caller_user_id" text,
	"caller_extension" text NOT NULL,
	"dialed_number" text NOT NULL,
	"channel_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"acknowledgements" integer DEFAULT 0 NOT NULL,
	"outcome" "crew_call_outcome",
	"correct" boolean
);
--> statement-breakpoint
CREATE TABLE "rescue_crews" (
	"id" text PRIMARY KEY NOT NULL,
	"service" "dispatch_service" NOT NULL,
	"callsign" text NOT NULL,
	"phone_number" text NOT NULL,
	"voice_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telephony_workstations" (
	"extension" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dds_crew_calls" ADD CONSTRAINT "dds_crew_calls_exercise_id_dds_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."dds_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dds_crew_calls" ADD CONSTRAINT "dds_crew_calls_crew_id_rescue_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."rescue_crews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dds_crew_calls" ADD CONSTRAINT "dds_crew_calls_caller_user_id_users_id_fk" FOREIGN KEY ("caller_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_workstations" ADD CONSTRAINT "telephony_workstations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dds_crew_calls_channel_unique_idx" ON "dds_crew_calls" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "dds_crew_calls_exercise_idx" ON "dds_crew_calls" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rescue_crews_phone_number_unique_idx" ON "rescue_crews" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "rescue_crews_service_idx" ON "rescue_crews" USING btree ("service");--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_workstations_user_unique_idx" ON "telephony_workstations" USING btree ("user_id");
