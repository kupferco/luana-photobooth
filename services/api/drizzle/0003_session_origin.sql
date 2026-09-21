CREATE TYPE "public"."session_origin" AS ENUM('guest', 'booth');--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "origin" "session_origin" DEFAULT 'guest' NOT NULL;