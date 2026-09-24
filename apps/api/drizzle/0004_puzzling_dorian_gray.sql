CREATE TABLE "task_event_links" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid,
	"occurrence_index" integer,
	"source_id" uuid,
	"external_uid" text,
	"external_recurrence_id" text,
	CONSTRAINT "task_event_links_one_target" CHECK ((
      ("task_event_links"."event_id" IS NOT NULL AND "task_event_links"."occurrence_index" IS NOT NULL AND "task_event_links"."occurrence_index" >= 0 AND "task_event_links"."source_id" IS NULL AND "task_event_links"."external_uid" IS NULL AND "task_event_links"."external_recurrence_id" IS NULL)
      OR
      ("task_event_links"."event_id" IS NULL AND "task_event_links"."occurrence_index" IS NULL AND "task_event_links"."source_id" IS NOT NULL AND "task_event_links"."external_uid" IS NOT NULL AND "task_event_links"."external_uid" <> '')
    ))
);
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_event_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "task_event_links" ADD CONSTRAINT "task_event_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_event_links" ADD CONSTRAINT "task_event_links_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_event_links" ADD CONSTRAINT "task_event_links_source_id_calendar_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."calendar_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_event_links_event_idx" ON "task_event_links" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "task_event_links_source_idx" ON "task_event_links" USING btree ("source_id");--> statement-breakpoint
INSERT INTO "task_event_links" ("task_id", "event_id", "occurrence_index")
SELECT "id", "event_id", 0 FROM "tasks" WHERE "event_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "event_id";
