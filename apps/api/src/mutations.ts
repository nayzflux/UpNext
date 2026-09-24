import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import {
  defaultSessionPercent,
  expandEvents,
  localDate,
  minutesBetween,
  normalizeTagName,
  overlaps,
  plannedSessionPercent,
  sessionIsWithinGrace,
  SESSION_GRACE_MS,
  suggestedEstimate,
  type CalendarEvent,
  type Preferences,
  type Task,
  type eventInputSchema,
  type logInputSchema,
  type sessionInputSchema,
} from "@upnext/contracts";
import type { z } from "zod";
import { db, type Connection } from "./db";
import {
  calendarSources,
  events,
  preferences,
  studySessions,
  tags,
  tasks,
  taskEventLinks,
  taskTags,
  workLogs,
} from "./db/schema";
import { eventToWire, getSnapshot, logToWire, sessionToWire, taskToWire } from "./data";
import { getImportedEvents } from "./calendar-sources";
import {
  resolveTaskEventLink,
  syncImportedEventTasks,
  syncLocalEventTasks,
} from "./task-event-links";

function notFound() {
  return new ORPCError("NOT_FOUND", {
    message: "Cet élément n’existe plus ou n’est pas accessible.",
  });
}

function revisionConflict() {
  return new ORPCError("CONFLICT", {
    message: "Cet élément a été modifié ailleurs. Actualise les données puis réessaie.",
  });
}

// One short transaction per user serializes schedule checks and progress updates.
// The database remains the authority when two tabs submit at the same time.
export async function mutate<T>(
  userId: string,
  operation: (connection: Connection) => Promise<T>,
) {
  return db.transaction(async (connection) => {
    await connection.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
    );
    return operation(connection);
  });
}

async function ownedTask(connection: Connection, userId: string, id: string) {
  const [task] = await connection
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  if (!task) throw notFound();
  return task;
}

export async function saveTask(
  userId: string,
  input: Omit<Task, "id" | "progress" | "revision" | "createdAt"> & {
    id?: string;
    revision?: number;
  },
) {
  return mutate(userId, async (connection) => {
    if (input.id) {
      const existing = await ownedTask(connection, userId, input.id);
      if (existing.revision !== input.revision) throw revisionConflict();
    }
    const tagIds = [...new Set(input.tagIds)];
    if (tagIds.length) {
      const ownedTags = await connection
        .select()
        .from(tags)
        .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)));
      if (ownedTags.length !== tagIds.length) throw notFound();
    }
    const linkedDate = input.eventLink
      ? await resolveTaskEventLink(connection, userId, input.eventLink)
      : { dueAt: input.dueAt, dateOnly: input.dateOnly };
    const values = {
      title: input.title,
      notes: input.notes,
      priority: input.priority,
      ...linkedDate,
      estimatedMinutes: input.estimatedMinutes,
    };
    const [saved] = input.id
      ? await connection
          .update(tasks)
          .set({ ...values, revision: sql`${tasks.revision} + 1` })
          .where(and(eq(tasks.id, input.id), eq(tasks.userId, userId)))
          .returning()
      : await connection
          .insert(tasks)
          .values({ ...values, userId })
          .returning();

    await connection
      .delete(taskTags)
      .where(and(eq(taskTags.taskId, saved.id), eq(taskTags.userId, userId)));
    if (tagIds.length) {
      await connection
        .insert(taskTags)
        .values(tagIds.map((tagId) => ({ taskId: saved.id, tagId, userId })));
    }
    await connection.delete(taskEventLinks).where(eq(taskEventLinks.taskId, saved.id));
    if (input.eventLink) {
      await connection.insert(taskEventLinks).values(
        input.eventLink.type === "local"
          ? {
              taskId: saved.id,
              eventId: input.eventLink.eventId,
              occurrenceIndex: input.eventLink.occurrenceIndex,
            }
          : {
              taskId: saved.id,
              sourceId: input.eventLink.sourceId,
              externalUid: input.eventLink.uid,
              externalRecurrenceId: input.eventLink.recurrenceId,
            },
      );
    }
    return taskToWire(saved, tagIds, input.eventLink);
  });
}

export async function deleteTask(userId: string, id: string) {
  return mutate(userId, async (connection) => {
    const deleted = await connection
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    if (!deleted.length) throw notFound();
    return { success: true as const };
  });
}

export async function saveTag(userId: string, name: string, id?: string) {
  return mutate(userId, async (connection) => {
    const cleanName = name.trim().replace(/\s+/g, " ").normalize("NFC");
    const normalizedName = normalizeTagName(cleanName);
    const [duplicate] = await connection
      .select()
      .from(tags)
      .where(and(eq(tags.userId, userId), eq(tags.normalizedName, normalizedName)));
    if (duplicate && (!id || duplicate.id === id)) {
      if (!id) return { id: duplicate.id, name: duplicate.name };
    } else if (duplicate) {
      throw new ORPCError("CONFLICT", { message: "Tu possèdes déjà un tag avec ce nom." });
    }
    const [saved] = id
      ? await connection
          .update(tags)
          .set({ name: cleanName, normalizedName })
          .where(and(eq(tags.id, id), eq(tags.userId, userId)))
          .returning()
      : await connection
          .insert(tags)
          .values({ userId, name: cleanName, normalizedName })
          .returning();
    if (!saved) throw notFound();
    return { id: saved.id, name: saved.name };
  });
}

export async function deleteTag(userId: string, id: string) {
  return mutate(userId, async (connection) => {
    const deleted = await connection
      .delete(tags)
      .where(and(eq(tags.id, id), eq(tags.userId, userId)))
      .returning();
    if (!deleted.length) throw notFound();
    return { success: true as const };
  });
}

export async function saveSession(userId: string, input: z.infer<typeof sessionInputSchema>) {
  return mutate(userId, async (connection) => {
    const task = await ownedTask(connection, userId, input.taskId);
    if (task.progress === 100)
      throw new ORPCError("BAD_REQUEST", { message: "Cette tâche est déjà terminée." });
    if (input.id) {
      const [existing] = await connection
        .select()
        .from(studySessions)
        .where(and(eq(studySessions.id, input.id), eq(studySessions.userId, userId)));
      if (!existing) throw notFound();
      if (
        existing.revision !== input.revision ||
        existing.status !== "planned" ||
        new Date(existing.endAt) <= new Date()
      )
        throw revisionConflict();
    }
    const snapshot = await getSnapshot(userId, connection);
    const now = new Date();
    const assignedPercent = plannedSessionPercent(task.id, snapshot.sessions, now, input.id);
    const availablePercent = Math.max(0, 100 - task.progress - assignedPercent);
    const plannedPercent =
      input.plannedPercent ??
      Math.min(
        availablePercent,
        defaultSessionPercent(
          minutesBetween(input.startAt, input.endAt),
          task.estimatedMinutes,
        ),
      );
    if (
      sessionIsWithinGrace(input.endAt, now) &&
      plannedPercent > availablePercent + 0.000001
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: "La part planifiée dépasse les 100 % de cette tâche.",
      });
    }
    const busy = [
      ...snapshot.sessions.filter(
        (session) => session.id !== input.id && session.status === "planned",
      ),
      ...expandEvents(snapshot.events, input.startAt, input.endAt),
      ...(await getImportedEvents(userId, input.startAt, input.endAt, connection)),
    ];
    if (!input.allowOverlap && busy.some((slot) => overlaps(input, slot))) {
      throw new ORPCError("CONFLICT", {
        message:
          "Ce créneau chevauche une séance ou un événement. Confirme le chevauchement pour le conserver.",
      });
    }
    const values = {
      taskId: input.taskId,
      startAt: input.startAt,
      endAt: input.endAt,
      plannedPercent,
    };
    const [saved] = input.id
      ? await connection
          .update(studySessions)
          .set({ ...values, revision: sql`${studySessions.revision} + 1` })
          .where(and(eq(studySessions.id, input.id), eq(studySessions.userId, userId)))
          .returning()
      : await connection
          .insert(studySessions)
          .values({ ...values, userId })
          .returning();
    return sessionToWire(saved);
  });
}

export async function cancelSession(userId: string, id: string, revision: number) {
  return mutate(userId, async (connection) => {
    const [existing] = await connection
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, id), eq(studySessions.userId, userId)));
    if (!existing) throw notFound();
    if (
      existing.revision !== revision ||
      existing.status !== "planned" ||
      new Date(existing.endAt) <= new Date()
    )
      throw revisionConflict();
    await connection
      .update(studySessions)
      .set({ status: "cancelled", cancellationReason: "manual", revision: revision + 1 })
      .where(eq(studySessions.id, id));
    return { success: true as const };
  });
}

export async function deleteSession(userId: string, id: string, revision: number) {
  return mutate(userId, async (connection) => {
    const [existing] = await connection
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, id), eq(studySessions.userId, userId)));
    if (!existing || existing.archivedAt) throw notFound();
    if (existing.revision !== revision) throw revisionConflict();

    const [linkedLog] = await connection
      .select({ id: workLogs.id })
      .from(workLogs)
      .where(and(eq(workLogs.sessionId, id), eq(workLogs.userId, userId)))
      .limit(1);

    if (linkedLog) {
      await connection
        .update(studySessions)
        .set({
          archivedAt: new Date().toISOString(),
          revision: revision + 1,
        })
        .where(eq(studySessions.id, id));
    } else {
      await connection.delete(studySessions).where(eq(studySessions.id, id));
    }

    return { success: true as const };
  });
}

export async function saveLog(userId: string, input: z.infer<typeof logInputSchema>) {
  return mutate(userId, async (connection) => {
    const task = await ownedTask(connection, userId, input.taskId);
    const [sameRequest] = await connection
      .select()
      .from(workLogs)
      .where(and(eq(workLogs.userId, userId), eq(workLogs.requestId, input.requestId)));
    if (sameRequest) {
      if (sameRequest.taskId !== input.taskId) throw revisionConflict();
      return { log: logToWire(sameRequest), suggestedEstimate: null };
    }
    if (task.revision !== input.taskRevision) throw revisionConflict();
    const [latest] = await connection
      .select()
      .from(workLogs)
      .where(and(eq(workLogs.taskId, task.id), eq(workLogs.userId, userId)))
      .orderBy(desc(workLogs.createdAt))
      .limit(1);
    if (input.id && (!latest || latest.id !== input.id)) {
      throw new ORPCError("CONFLICT", {
        message: "Seul le dernier bilan de cette tâche peut être corrigé.",
      });
    }
    if (input.id && latest.sessionId !== input.sessionId) throw revisionConflict();
    const progressBefore = input.id ? latest.progressBefore : task.progress;
    const actualMinutes = input.missed ? 0 : input.actualMinutes;
    const progressAfter = input.missed ? progressBefore : input.progressAfter;
    if (actualMinutes === undefined || progressAfter === undefined) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Indique le temps passé et l’avancement de la tâche.",
      });
    }

    let sessionStartAt: string | undefined;
    if (input.sessionId) {
      const [session] = await connection
        .select()
        .from(studySessions)
        .where(
          and(
            eq(studySessions.id, input.sessionId),
            eq(studySessions.userId, userId),
            eq(studySessions.taskId, task.id),
          ),
        );
      if (!session) throw notFound();
      sessionStartAt = session.startAt;
      if (!input.id && session.status !== "planned") throw revisionConflict();
      if (input.missed && new Date(session.startAt) > new Date()) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Cette séance n’a pas encore commencé. Tu peux l’annuler depuis le planning.",
        });
      }
      await connection
        .update(studySessions)
        .set({
          status: input.missed ? "missed" : "completed",
          cancellationReason: null,
          revision: session.revision + 1,
        })
        .where(eq(studySessions.id, session.id));
    }
    const actualStartAt = input.id
      ? latest.actualStartAt
      : (sessionStartAt ?? new Date(Date.now() - actualMinutes * 60000).toISOString());
    if (
      !input.missed &&
      new Date(actualStartAt).getTime() + actualMinutes * 60000 > Date.now() + 60000
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Le bilan doit décrire une séance déjà effectuée.",
      });
    }
    const values = {
      requestId: input.requestId,
      actualStartAt,
      actualMinutes,
      progressBefore,
      progressAfter,
      note: input.missed ? "" : input.note,
      missed: input.missed,
    };
    const [saved] = input.id
      ? await connection
          .update(workLogs)
          .set(values)
          .where(and(eq(workLogs.id, input.id), eq(workLogs.userId, userId)))
          .returning()
      : await connection
          .insert(workLogs)
          .values({ ...values, userId, taskId: task.id, sessionId: input.sessionId })
          .returning();
    await connection
      .update(tasks)
      .set({ progress: progressAfter, revision: task.revision + 1 })
      .where(eq(tasks.id, task.id));
    const graceCutoff = new Date(Date.now() - SESSION_GRACE_MS).toISOString();
    if (progressAfter === 100) {
      await connection
        .update(studySessions)
        .set({
          status: "cancelled",
          cancellationReason: "task-completed",
          revision: sql`${studySessions.revision} + 1`,
        })
        .where(
          and(
            eq(studySessions.taskId, task.id),
            eq(studySessions.status, "planned"),
            gt(studySessions.endAt, graceCutoff),
          ),
        );
    } else {
      const futureSessions = await connection
        .select()
        .from(studySessions)
        .where(
          and(
            eq(studySessions.taskId, task.id),
            eq(studySessions.status, "planned"),
            gt(studySessions.endAt, graceCutoff),
          ),
        )
        .orderBy(studySessions.startAt, studySessions.id);
      let availablePercent = 100 - progressAfter;

      for (const session of futureSessions) {
        const plannedPercent = Math.min(session.plannedPercent, Math.max(0, availablePercent));
        if (plannedPercent !== session.plannedPercent) {
          await connection
            .update(studySessions)
            .set({ plannedPercent, revision: session.revision + 1 })
            .where(eq(studySessions.id, session.id));
        }
        availablePercent -= plannedPercent;
      }
    }
    const allLogs = await connection
      .select()
      .from(workLogs)
      .where(and(eq(workLogs.taskId, task.id), eq(workLogs.userId, userId)));
    const totalActualMinutes = allLogs.reduce((total, log) => total + log.actualMinutes, 0);
    return {
      log: logToWire(saved),
      suggestedEstimate: suggestedEstimate(
        task.estimatedMinutes,
        totalActualMinutes,
        progressAfter,
      ),
    };
  });
}

export async function saveEvent(userId: string, input: z.infer<typeof eventInputSchema>) {
  return mutate(userId, async (connection) => {
    if (input.id) {
      const [existing] = await connection
        .select()
        .from(events)
        .where(and(eq(events.id, input.id), eq(events.userId, userId)));
      if (!existing) throw notFound();
      if (existing.revision !== input.revision) throw revisionConflict();
    }
    if (input.repeatUntil && input.repeatUntil < localDate(input.startAt, input.timeZone)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "La fin de répétition doit suivre le premier événement.",
      });
    }
    const snapshot = await getSnapshot(userId, connection);
    const otherEvents = snapshot.events.filter((event) => event.id !== input.id);
    const latestStart = Math.max(
      new Date(input.startAt).getTime(),
      ...otherEvents.map((event) => new Date(event.startAt).getTime()),
      ...snapshot.sessions.map((session) => new Date(session.endAt).getTime()),
    );
    // Include a complete seasonal cycle when weekly series use different time zones.
    const horizon = new Date(latestStart + 370 * 86400000).toISOString();
    const candidate: CalendarEvent = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      revision: 0,
    };
    const occurrences = expandEvents([candidate], input.startAt, horizon);
    const busy = [
      ...snapshot.sessions.filter((session) => session.status === "planned"),
      ...expandEvents(otherEvents, input.startAt, horizon),
      ...(await getImportedEvents(userId, input.startAt, horizon, connection)),
    ];
    if (
      !input.allowOverlap &&
      occurrences.some((occurrence) => busy.some((slot) => overlaps(occurrence, slot)))
    ) {
      throw new ORPCError("CONFLICT", {
        message:
          "Cet événement chevauche ton planning. Confirme le chevauchement pour le conserver.",
      });
    }
    const values = {
      title: input.title,
      startAt: input.startAt,
      endAt: input.endAt,
      weekly: input.weekly,
      repeatUntil: input.weekly ? input.repeatUntil : null,
      timeZone: input.timeZone,
    };
    const [saved] = input.id
      ? await connection
          .update(events)
          .set({ ...values, revision: sql`${events.revision} + 1` })
          .where(and(eq(events.id, input.id), eq(events.userId, userId)))
          .returning()
      : await connection
          .insert(events)
          .values({ ...values, userId })
          .returning();
    await syncLocalEventTasks(connection, saved);
    return eventToWire(saved);
  });
}

export async function deleteEvent(userId: string, id: string) {
  return mutate(userId, async (connection) => {
    const deleted = await connection
      .delete(events)
      .where(and(eq(events.id, id), eq(events.userId, userId)))
      .returning();
    if (!deleted.length) throw notFound();
    return { success: true as const };
  });
}

export async function savePreferences(userId: string, input: Preferences) {
  return mutate(userId, async (connection) => {
    await connection
      .insert(preferences)
      .values({ ...input, userId })
      .onConflictDoUpdate({ target: preferences.userId, set: input });
    const sources = await connection
      .select()
      .from(calendarSources)
      .where(eq(calendarSources.userId, userId));
    for (const source of sources) {
      await syncImportedEventTasks(connection, source, input.timeZone);
    }
    return input;
  });
}
