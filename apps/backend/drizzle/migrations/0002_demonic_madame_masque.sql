CREATE TABLE "auth_refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_refresh_tokens_token_hash_unique_idx" ON "auth_refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_refresh_tokens_session_id_idx" ON "auth_refresh_tokens" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "auth_refresh_tokens_expires_at_idx" ON "auth_refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");