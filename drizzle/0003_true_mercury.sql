ALTER TABLE "scan_event" ADD COLUMN "result_count" integer;--> statement-breakpoint
CREATE INDEX "scan_scanner_idx" ON "scan_event" USING btree ("scanner_user_id","at");