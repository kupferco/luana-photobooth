CREATE TABLE "device_names" (
	"name" text PRIMARY KEY NOT NULL,
	"hardware_id" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_names_hardware_id_unique" UNIQUE("hardware_id")
);
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "hardware_id" text;--> statement-breakpoint
CREATE INDEX "devices_hardware_idx" ON "devices" USING btree ("tenant_id","hardware_id");