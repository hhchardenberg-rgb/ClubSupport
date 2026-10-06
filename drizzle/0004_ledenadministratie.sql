CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" date,
	"end_date" date,
	"status_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "membership_dates_ok" CHECK ("membership"."end_date" is null or "membership"."start_date" is null or "membership"."end_date" >= "membership"."start_date"),
	CONSTRAINT "membership_status_ok" CHECK ("membership"."status" in ('active','suspended','ended'))
);
--> statement-breakpoint
ALTER TABLE "import_batch" ADD COLUMN "raw" jsonb;--> statement-breakpoint
ALTER TABLE "import_batch" ADD COLUMN "mapping" jsonb;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_member_idx" ON "membership" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_one_open" ON "membership" USING btree ("member_id") WHERE "membership"."status" in ('active','suspended');--> statement-breakpoint
CREATE UNIQUE INDEX "member_external_ref_unique" ON "member" USING btree ("external_ref") WHERE "member"."external_ref" is not null;--> statement-breakpoint
-- Backfill: elk bestaand (niet-verwijderd) lid krijgt een lopend lidmaatschap zonder datums, zodat de bestaande
-- passen na deze migratie ongewijzigd geldig blijven. Idempotent (alleen voor leden zonder lidmaatschap).
INSERT INTO "membership" ("member_id", "status", "status_note")
SELECT m."id", 'active', 'Migratie: bestaand lid overgenomen als actief lidmaatschap'
FROM "member" m
WHERE m."deleted_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "membership" ms WHERE ms."member_id" = m."id");
