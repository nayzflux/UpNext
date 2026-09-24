import { and, eq, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import {
  localDate,
  localEventOccurrence,
  zonedInstant,
  type CalendarEvent,
  type EventLink,
  type ImportedEvent,
} from "@upnext/contracts";
import type { Connection } from "./db";
import { calendarSources, events, preferences, taskEventLinks, tasks } from "./db/schema";
import { resolveImportedOccurrence, type SourceContent } from "./ical";

function missingEvent() {
  return new ORPCError("NOT_FOUND", { message: "Cet événement n’est plus disponible." });
}

export function linkedDue(
  occurrence: Pick<ImportedEvent, "startAt" | "allDay">,
  zone: string,
) {
  return occurrence.allDay
    ? {
        dueAt: zonedInstant(localDate(occurrence.startAt, zone), "23:59", zone),
        dateOnly: true,
      }
    : { dueAt: occurrence.startAt, dateOnly: false };
}

export function localEventFromRow(row: typeof events.$inferSelect): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    startAt: new Date(row.startAt).toISOString(),
    endAt: new Date(row.endAt).toISOString(),
    weekly: row.weekly,
    repeatUntil: row.repeatUntil,
    timeZone: row.timeZone,
    revision: row.revision,
  };
}

async function updateLinkedDate(
  connection: Connection,
  taskId: string,
  due: { dueAt: string; dateOnly: boolean },
) {
  const [task] = await connection
    .select({ dueAt: tasks.dueAt, dateOnly: tasks.dateOnly })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (
    !task ||
    (new Date(task.dueAt).toISOString() === due.dueAt && task.dateOnly === due.dateOnly)
  )
    return;
  await connection
    .update(tasks)
    .set({
      ...due,
      revision: sql`${tasks.revision} + 1`,
    })
    .where(eq(tasks.id, taskId));
}

export async function resolveTaskEventLink(
  connection: Connection,
  userId: string,
  link: EventLink,
): Promise<{ dueAt: string; dateOnly: boolean }> {
  if (link.type === "local") {
    const [row] = await connection
      .select()
      .from(events)
      .where(and(eq(events.id, link.eventId), eq(events.userId, userId)));
    if (!row) throw missingEvent();
    const occurrence = localEventOccurrence(localEventFromRow(row), link.occurrenceIndex);
    if (!occurrence) throw missingEvent();
    return { dueAt: occurrence.startAt, dateOnly: false };
  }
  const [source] = await connection
    .select()
    .from(calendarSources)
    .where(and(eq(calendarSources.id, link.sourceId), eq(calendarSources.userId, userId)));
  if (!source) throw missingEvent();
  const [settings] = await connection
    .select()
    .from(preferences)
    .where(eq(preferences.userId, userId));
  const zone = settings?.timeZone ?? "Europe/Paris";
  const occurrence = resolveImportedOccurrence(source, link.uid, link.recurrenceId, zone);
  if (!occurrence) throw missingEvent();
  return linkedDue(occurrence, zone);
}

export async function syncLocalEventTasks(
  connection: Connection,
  row: typeof events.$inferSelect,
) {
  const links = await connection
    .select()
    .from(taskEventLinks)
    .where(eq(taskEventLinks.eventId, row.id));
  const event = localEventFromRow(row);
  for (const link of links) {
    const occurrence = localEventOccurrence(event, link.occurrenceIndex!);
    if (!occurrence) {
      await connection.delete(taskEventLinks).where(eq(taskEventLinks.taskId, link.taskId));
      continue;
    }
    await updateLinkedDate(connection, link.taskId, {
      dueAt: occurrence.startAt,
      dateOnly: false,
    });
  }
}

export async function syncImportedEventTasks(
  connection: Connection,
  source: SourceContent,
  zone: string,
) {
  const links = await connection
    .select()
    .from(taskEventLinks)
    .where(eq(taskEventLinks.sourceId, source.id));
  for (const link of links) {
    const occurrence = resolveImportedOccurrence(
      source,
      link.externalUid!,
      link.externalRecurrenceId,
      zone,
    );
    if (!occurrence) {
      await connection.delete(taskEventLinks).where(eq(taskEventLinks.taskId, link.taskId));
      continue;
    }
    const due = linkedDue(occurrence, zone);
    await updateLinkedDate(connection, link.taskId, due);
  }
}
