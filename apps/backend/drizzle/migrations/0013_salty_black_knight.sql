CREATE TYPE "public"."training_assignment_status" AS ENUM('draft', 'in_progress', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."training_assignment_type" AS ENUM('voice_call', 'card_action', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."training_card_source" AS ENUM('generated', 'ticket', 'operator_call');--> statement-breakpoint
CREATE TYPE "public"."training_group_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."training_attempt_status" AS ENUM('offered', 'active', 'completed', 'declined', 'cancelled_by_instructor', 'abandoned');--> statement-breakpoint
CREATE TABLE "training_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"scenario_version_id" text NOT NULL,
	"group_id" text,
	"target_user_id" text,
	"type" "training_assignment_type" DEFAULT 'voice_call' NOT NULL,
	"card_source" "training_card_source" DEFAULT 'generated' NOT NULL,
	"service_tag" text,
	"answer_norm_seconds" integer DEFAULT 240 NOT NULL,
	"pass_threshold" integer DEFAULT 75 NOT NULL,
	"max_attempts" integer DEFAULT 3,
	"due_date" timestamp with time zone,
	"status" "training_assignment_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"launched_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_assignments_one_target_check" CHECK (("training_assignments"."group_id" is not null) <> ("training_assignments"."target_user_id" is not null)),
	CONSTRAINT "training_assignments_pass_threshold_check" CHECK ("training_assignments"."pass_threshold" between 50 and 100),
	CONSTRAINT "training_assignments_answer_norm_check" CHECK ("training_assignments"."answer_norm_seconds" > 0),
	CONSTRAINT "training_assignments_max_attempts_check" CHECK ("training_assignments"."max_attempts" is null or "training_assignments"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "training_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"operator_id" text NOT NULL,
	"training_session_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "training_attempt_status" DEFAULT 'offered' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "training_group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"service_tag" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"organization" text NOT NULL,
	"instructor_id" text NOT NULL,
	"status" "training_group_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_scenario_version_id_scenario_versions_id_fk" FOREIGN KEY ("scenario_version_id") REFERENCES "public"."scenario_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_group_id_training_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."training_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_attempts" ADD CONSTRAINT "training_attempts_assignment_id_training_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."training_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_attempts" ADD CONSTRAINT "training_attempts_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_group_members" ADD CONSTRAINT "training_group_members_group_id_training_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."training_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_group_members" ADD CONSTRAINT "training_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_groups" ADD CONSTRAINT "training_groups_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_assignments_group_idx" ON "training_assignments" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "training_assignments_target_user_idx" ON "training_assignments" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "training_assignments_scenario_version_idx" ON "training_assignments" USING btree ("scenario_version_id");--> statement-breakpoint
CREATE INDEX "training_assignments_status_idx" ON "training_assignments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "training_attempts_session_unique_idx" ON "training_attempts" USING btree ("training_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_attempts_number_unique_idx" ON "training_attempts" USING btree ("assignment_id","operator_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "training_attempts_operator_active_unique_idx" ON "training_attempts" USING btree ("operator_id") WHERE "training_attempts"."status" in ('offered', 'active');--> statement-breakpoint
CREATE INDEX "training_attempts_operator_idx" ON "training_attempts" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "training_attempts_status_idx" ON "training_attempts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "training_group_members_group_user_unique_idx" ON "training_group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "training_group_members_user_idx" ON "training_group_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_groups_code_unique_idx" ON "training_groups" USING btree ("code");--> statement-breakpoint
CREATE INDEX "training_groups_instructor_idx" ON "training_groups" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "training_groups_status_idx" ON "training_groups" USING btree ("status");