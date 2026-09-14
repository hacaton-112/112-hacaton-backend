DROP INDEX "caller_personas_code_unique_idx";--> statement-breakpoint
CREATE INDEX "caller_personas_code_idx" ON "caller_personas" USING btree ("code");