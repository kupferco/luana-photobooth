ALTER TABLE "sessions" ADD COLUMN "queued_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "called_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "confirm_misses" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "sessions_queue_idx" ON "sessions" USING btree ("event_id","status","queued_at");