CREATE TABLE "calendar_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"content" text,
	"etag" text,
	"last_modified" text,
	"attempted_at" timestamp with time zone,
	"succeeded_at" timestamp with time zone,
	"syncing_until" timestamp with time zone,
	"error" text,
	CONSTRAINT "calendar_sources_user_url_unique" UNIQUE("user_id","url")
);
--> statement-breakpoint
ALTER TABLE "calendar_sources" ADD CONSTRAINT "calendar_sources_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_sources_user_idx" ON "calendar_sources" USING btree ("user_id");