ALTER TABLE "events" ADD COLUMN "retakes_allowed" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "retake_count" smallint DEFAULT 0 NOT NULL;