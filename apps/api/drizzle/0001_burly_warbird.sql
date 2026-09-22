ALTER TABLE "study_sessions" ADD COLUMN "planned_percent" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "study_sessions" AS s
SET "planned_percent" = LEAST(
  100,
  ROUND(
    (EXTRACT(EPOCH FROM (s."end_at" - s."start_at")) / 60 / t."estimated_minutes" * 100)::numeric,
    1
  )::double precision
)
FROM "tasks" AS t
WHERE t."id" = s."task_id";--> statement-breakpoint
WITH ranked AS (
  SELECT
    s."id",
    s."planned_percent",
    t."progress",
    COALESCE(
      SUM(s."planned_percent") OVER (
        PARTITION BY s."task_id"
        ORDER BY s."start_at", s."id"
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS earlier_percent
  FROM "study_sessions" AS s
  JOIN "tasks" AS t ON t."id" = s."task_id"
  WHERE s."status" = 'planned' AND s."end_at" > NOW()
)
UPDATE "study_sessions" AS s
SET "planned_percent" = GREATEST(
  0,
  LEAST(r."planned_percent", 100 - r."progress" - r.earlier_percent)
)
FROM ranked AS r
WHERE s."id" = r."id";--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "session_planned_percent_range" CHECK ("study_sessions"."planned_percent" >= 0 AND "study_sessions"."planned_percent" <= 100);
