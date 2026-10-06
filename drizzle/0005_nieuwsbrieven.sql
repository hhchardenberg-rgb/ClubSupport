CREATE TABLE "newsletter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"audience" text DEFAULT 'members' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"recipient_count" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_by" text,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "newsletter_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"newsletter_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_ref" text,
	"last_error" text,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "newsletter_optout" (
	"email" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'link' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "newsletter" ADD CONSTRAINT "newsletter_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter" ADD CONSTRAINT "newsletter_sent_by_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_delivery" ADD CONSTRAINT "newsletter_delivery_newsletter_id_newsletter_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."newsletter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "newsletter_status_idx" ON "newsletter" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_delivery_unique" ON "newsletter_delivery" USING btree ("newsletter_id","email");--> statement-breakpoint
CREATE INDEX "newsletter_delivery_due_idx" ON "newsletter_delivery" USING btree ("status","next_attempt_at");