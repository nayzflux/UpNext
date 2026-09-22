import { eq } from "drizzle-orm";
import {
  eventSchema,
  preferencesSchema,
  sessionSchema,
  snapshotSchema,
  taskSchema,
  workLogSchema,
  type Snapshot,
} from "@upnext/contracts";
import { db, type Connection } from "./db";
import { sourceToWire } from "./calendar-sources";
import {
  calendarSources,
  events,
  preferences,
  studySessions,
  tags,
  tasks,
  taskTags,
  workLogs,
} from "./db/schema";

export function taskToWire(row: typeof tasks.$inferSelect, tagIds: string[]) {
  return taskSchema.parse({
    ...row,
    dueAt: new Date(row.dueAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    tagIds,
  });
}

export function sessionToWire(row: typeof studySessions.$inferSelect) {
  return sessionSchema.parse({
    ...row,
    status:
      row.status === "planned" && new Date(row.endAt) <= new Date() ? "expired" : row.status,
    startAt: new Date(row.startAt).toISOString(),
    endAt: new Date(row.endAt).toISOString(),
  });
}

export function eventToWire(row: typeof events.$inferSelect) {
  return eventSchema.parse({
    ...row,
    startAt: new Date(row.startAt).toISOString(),
    endAt: new Date(row.endAt).toISOString(),
  });
}

export function logToWire(row: typeof workLogs.$inferSelect) {
  return workLogSchema.parse({
    ...row,
    actualStartAt: new Date(row.actualStartAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
  });
}

export async function getSnapshot(
  userId: string,
  connection: Connection = db,
): Promise<Snapshot> {
  // A transaction uses one PostgreSQL connection: run its queries in sequence.
  const taskRows = await connection.select().from(tasks).where(eq(tasks.userId, userId));
  const tagRows = await connection
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.userId, userId));
  const links = await connection.select().from(taskTags).where(eq(taskTags.userId, userId));
  const sessionRows = await connection
    .select()
    .from(studySessions)
    .where(eq(studySessions.userId, userId));
  const logRows = await connection.select().from(workLogs).where(eq(workLogs.userId, userId));
  const eventRows = await connection.select().from(events).where(eq(events.userId, userId));
  const sourceRows = await connection.select({
    id: calendarSources.id,
    name: calendarSources.name,
    url: calendarSources.url,
    attemptedAt: calendarSources.attemptedAt,
    succeededAt: calendarSources.succeededAt,
    error: calendarSources.error,
  }).from(calendarSources).where(eq(calendarSources.userId, userId));
  const preferenceRows = await connection
    .select()
    .from(preferences)
    .where(eq(preferences.userId, userId));

  return snapshotSchema.parse({
    tasks: taskRows.map((task) =>
      taskToWire(
        task,
        links.filter((link) => link.taskId === task.id).map((link) => link.tagId),
      ),
    ),
    tags: tagRows.sort((a, b) => a.name.localeCompare(b.name, "fr")),
    sessions: sessionRows.map(sessionToWire),
    logs: logRows.map(logToWire).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    events: eventRows.map(eventToWire),
    calendarSources: sourceRows.map(sourceToWire).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    preferences: preferencesSchema.parse(preferenceRows[0] ?? {}),
    serverNow: new Date().toISOString(),
  });
}
