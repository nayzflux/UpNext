import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import {
  expandEvents,
  localDate,
  normalizeTagName,
  overlaps,
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
  events,
  preferences,
  studySessions,
  tags,
  tasks,
  taskTags,
  workLogs,
} from "./db/schema";
import { eventToWire, getSnapshot, logToWire, sessionToWire, taskToWire } from "./data";

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
    if (input.eventId) {
      const [event] = await connection
        .select()
        .from(events)
        .where(and(eq(events.id, input.eventId), eq(events.userId, userId)));
      if (!event) throw notFound();
    }
    const values = {
      title: input.title,
      notes: input.notes,
      priority: input.priority,
      dueAt: input.dueAt,
      dateOnly: input.dateOnly,
      estimatedMinutes: input.estimatedMinutes,
      eventId: input.eventId,
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
    return taskToWire(saved, tagIds);
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
      if (existing.revision !== input.revision || existing.status !== "planned")
        throw revisionConflict();
    }
    const snapshot = await getSnapshot(userId, connection);
    const busy = [
      ...snapshot.sessions.filter(
        (session) => session.id !== input.id && session.status === "planned",
      ),
      ...expandEvents(snapshot.events, input.startAt, input.endAt),
    ];
    if (!input.allowOverlap && busy.some((slot) => overlaps(input, slot))) {
      throw new ORPCError("CONFLICT", {
        message:
          "Ce créneau chevauche une séance ou un événement. Confirme le chevauchement pour le conserver.",
      });
    }
    const values = { taskId: input.taskId, startAt: input.startAt, endAt: input.endAt };
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
    if (existing.revision !== revision || existing.status !== "planned")
      throw revisionConflict();
    await connection
      .update(studySessions)
      .set({ status: "cancelled", cancellationReason: "manual", revision: revision + 1 })
      .where(eq(studySessions.id, id));
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
    if (
      new Date(input.actualStartAt).getTime() + input.actualMinutes * 60000 >
      Date.now() + 60000
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Le bilan doit décrire une séance déjà effectuée.",
      });
    }
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
    const progressAfter = input.missed ? progressBefore : input.progressAfter;
    if (input.missed && input.actualMinutes !== 0) throw new ORPCError("BAD_REQUEST");

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
    const values = {
      requestId: input.requestId,
      actualStartAt: input.actualStartAt,
      actualMinutes: input.actualMinutes,
      progressBefore,
      progressAfter,
      note: input.note,
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
            gt(studySessions.startAt, new Date().toISOString()),
          ),
        );
    }
    const allLogs = await connection
      .select()
      .from(workLogs)
      .where(and(eq(workLogs.taskId, task.id), eq(workLogs.userId, userId)));
    const actualMinutes = allLogs.reduce((total, log) => total + log.actualMinutes, 0);
    return {
      log: logToWire(saved),
      suggestedEstimate: suggestedEstimate(
        task.estimatedMinutes,
        actualMinutes,
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
    return input;
  });
}
