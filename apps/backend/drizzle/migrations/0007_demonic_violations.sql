CREATE TYPE "public"."dispatch_service" AS ENUM('dds_01', 'dds_02', 'dds_03', 'dds_04', 'zhkh', 'antiterror', 'eddc', 'uadit', 'rosgvardia', 'cuks', 'ass', 'lpc', 'ss');--> statement-breakpoint
CREATE TYPE "public"."incident_category" AS ENUM('socially_significant', 'threat_to_people', 'emergency_threat', 'important');--> statement-breakpoint
CREATE TABLE "incident_card_victims" (
	"id" text PRIMARY KEY NOT NULL,
	"training_session_id" text NOT NULL,
	"order_index" smallint NOT NULL,
	"last_name" text,
	"first_name" text,
	"middle_name" text,
	"reason" text,
	"birth_date" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "incident_cards" (
	"training_session_id" text PRIMARY KEY NOT NULL,
	"caller_anonymous" boolean DEFAULT false NOT NULL,
	"caller_last_name" text,
	"caller_first_name" text,
	"caller_middle_name" text,
	"caller_language" text,
	"caller_phone" text,
	"address_text" text,
	"district" text,
	"object_type" text,
	"entrance" text,
	"floor" text,
	"intercom" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"nearby" boolean DEFAULT false NOT NULL,
	"place_notes" text,
	"incident_type" text,
	"categories" "incident_category"[] DEFAULT '{}' NOT NULL,
	"started_at" timestamp with time zone,
	"victims_total" smallint,
	"victims_children" smallint,
	"deaths_total" smallint,
	"deaths_children" smallint,
	"description" text,
	"services" "dispatch_service"[] DEFAULT '{}' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_states" ADD COLUMN "operator_id" text;--> statement-breakpoint
ALTER TABLE "incident_card_victims" ADD CONSTRAINT "incident_card_victims_training_session_id_incident_cards_training_session_id_fk" FOREIGN KEY ("training_session_id") REFERENCES "public"."incident_cards"("training_session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_cards" ADD CONSTRAINT "incident_cards_training_session_id_call_states_training_session_id_fk" FOREIGN KEY ("training_session_id") REFERENCES "public"."call_states"("training_session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "incident_card_victims_session_order_unique_idx" ON "incident_card_victims" USING btree ("training_session_id","order_index");--> statement-breakpoint
CREATE INDEX "incident_cards_submitted_at_idx" ON "incident_cards" USING btree ("submitted_at");--> statement-breakpoint
ALTER TABLE "call_states" ADD CONSTRAINT "call_states_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;