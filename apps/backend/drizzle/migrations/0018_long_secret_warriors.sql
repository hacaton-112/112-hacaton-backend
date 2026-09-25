CREATE TABLE "methodical_section_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"material_id" text NOT NULL,
	"section_id" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "methodical_section_progress" ADD CONSTRAINT "methodical_section_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "methodical_progress_user_section_unique_idx" ON "methodical_section_progress" USING btree ("user_id","material_id","section_id");--> statement-breakpoint
CREATE INDEX "methodical_progress_user_idx" ON "methodical_section_progress" USING btree ("user_id");