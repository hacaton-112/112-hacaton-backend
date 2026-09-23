CREATE TABLE "methodical_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"audience" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"roles" jsonb NOT NULL,
	"sections" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "methodical_materials" ADD CONSTRAINT "methodical_materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "methodical_materials_updated_idx" ON "methodical_materials" USING btree ("updated_at");
