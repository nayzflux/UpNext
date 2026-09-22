import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { Preferences } from "@upnext/contracts";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("auth_session_user_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("account_user_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const preferences = pgTable("preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  timeZone: text("time_zone").notNull().default("Europe/Paris"),
  theme: text("theme").$type<Preferences["theme"]>().notNull().default("system"),
  availability: jsonb("availability")
    .$type<Preferences["availability"]>()
    .notNull()
    .default([]),
});

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
  },
  (table) => [
    unique("tags_user_name_unique").on(table.userId, table.normalizedName),
    unique("tags_id_user_unique").on(table.id, table.userId),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startAt: timestamp("start_at", { withTimezone: true, mode: "string" }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "string" }).notNull(),
    weekly: boolean("weekly").notNull().default(false),
    repeatUntil: text("repeat_until"),
    timeZone: text("time_zone").notNull(),
    revision: integer("revision").notNull().default(0),
  },
  (table) => [
    index("events_user_idx").on(table.userId),
    check("event_interval", sql`${table.endAt} > ${table.startAt}`),
  ],
);

export const calendarSources = pgTable(
  "calendar_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    content: text("content"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true, mode: "string" }),
    succeededAt: timestamp("succeeded_at", { withTimezone: true, mode: "string" }),
    syncingUntil: timestamp("syncing_until", { withTimezone: true, mode: "string" }),
    error: text("error"),
  },
  (table) => [
    index("calendar_sources_user_idx").on(table.userId),
    unique("calendar_sources_user_url_unique").on(table.userId, table.url),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    priority: text("priority").$type<"low" | "normal" | "high">().notNull().default("normal"),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "string" }).notNull(),
    dateOnly: boolean("date_only").notNull().default(true),
    estimatedMinutes: integer("estimated_minutes").notNull(),
    progress: doublePrecision("progress").notNull().default(0),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tasks_user_due_idx").on(table.userId, table.dueAt),
    unique("tasks_id_user_unique").on(table.id, table.userId),
    check("task_progress_range", sql`${table.progress} >= 0 AND ${table.progress} <= 100`),
    check("task_estimate_positive", sql`${table.estimatedMinutes} > 0`),
  ],
);

export const taskTags = pgTable(
  "task_tags",
  {
    taskId: uuid("task_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.tagId] }),
    foreignKey({
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tagId, table.userId],
      foreignColumns: [tags.id, tags.userId],
    }).onDelete("cascade"),
  ],
);

export const studySessions = pgTable(
  "study_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true, mode: "string" }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "string" }).notNull(),
    plannedPercent: doublePrecision("planned_percent").notNull().default(0),
    status: text("status")
      .$type<"planned" | "completed" | "missed" | "cancelled">()
      .notNull()
      .default("planned"),
    cancellationReason: text("cancellation_reason").$type<"manual" | "task-completed">(),
    revision: integer("revision").notNull().default(0),
  },
  (table) => [
    index("study_sessions_user_start_idx").on(table.userId, table.startAt),
    check("session_interval", sql`${table.endAt} > ${table.startAt}`),
    check(
      "session_planned_percent_range",
      sql`${table.plannedPercent} >= 0 AND ${table.plannedPercent} <= 100`,
    ),
  ],
);

export const workLogs = pgTable(
  "work_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .references(() => studySessions.id, { onDelete: "set null" })
      .unique(),
    actualStartAt: timestamp("actual_start_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    actualMinutes: integer("actual_minutes").notNull(),
    progressBefore: doublePrecision("progress_before").notNull(),
    progressAfter: doublePrecision("progress_after").notNull(),
    note: text("note").notNull().default(""),
    missed: boolean("missed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("work_logs_request_unique").on(table.userId, table.requestId),
    index("work_logs_task_created_idx").on(table.taskId, table.createdAt),
    check("work_log_duration", sql`${table.actualMinutes} >= 0`),
    check(
      "work_log_progress",
      sql`${table.progressAfter} >= 0 AND ${table.progressAfter} <= 100`,
    ),
  ],
);
