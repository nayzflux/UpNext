import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { db, pool } from "./db";
import { studySessions, user } from "./db/schema";
import { getSnapshot } from "./data";
import {
  cancelSession,
  deleteSession,
  deleteEvent,
  deleteTag,
  deleteTask,
  saveEvent,
  saveLog,
  savePreferences,
  saveSession,
  saveTag,
  saveTask,
} from "./mutations";
import {
  getTaskMetrics,
  localEventOccurrence,
  taskFieldsSchema,
  type Task,
} from "@upnext/contracts";

const alice = crypto.randomUUID();
const bob = crypto.randomUUID();
const future = (days: number, hour = 10) => {
  const result = new Date();
  result.setUTCDate(result.getUTCDate() + days);
  result.setUTCHours(hour, 0, 0, 0);
  return result.toISOString();
};
const taskInput = (title = "Devoir") =>
  taskFieldsSchema.parse({ title, estimatedMinutes: 240, dueAt: future(7) });
const logInput = (task: Task) => ({
  requestId: crypto.randomUUID(),
  taskId: task.id,
  taskRevision: task.revision,
  sessionId: null,
  actualMinutes: 90,
  progressAfter: 25,
  note: "",
  missed: false,
});

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  await db.insert(user).values([
    { id: alice, name: "Alice test", email: `${alice}@example.test`, emailVerified: true },
    { id: bob, name: "Bob test", email: `${bob}@example.test`, emailVerified: true },
  ]);
});
afterAll(async () => {
  await db.delete(user).where(inArray(user.id, [alice, bob]));
  await pool.end();
});

describe("PostgreSQL : propriété, contraintes et transactions", () => {
  it("associe plusieurs tâches à une occurrence, suit son déplacement et garde leur date après suppression", async () => {
    const startAt = future(65);
    const endAt = new Date(new Date(startAt).getTime() + 3600000).toISOString();
    const event = await saveEvent(alice, {
      title: "Examen récurrent",
      startAt,
      endAt,
      weekly: true,
      repeatUntil: null,
      timeZone: "Europe/Paris",
      allowOverlap: true,
    });
    const link = { type: "local" as const, eventId: event.id, occurrenceIndex: 2 };
    const expected = localEventOccurrence(event, 2)!.startAt;
    const first = await saveTask(alice, { ...taskInput("Réviser"), eventLink: link });
    const second = await saveTask(alice, {
      ...taskInput("Préparer les notes"),
      eventLink: link,
    });
    expect(first.dueAt).toBe(expected);
    expect(second.dueAt).toBe(expected);
    const manualDate = await saveTask(alice, {
      ...first,
      dueAt: future(1),
      dateOnly: true,
    });
    expect(manualDate.dueAt).toBe(expected);
    expect(manualDate.dateOnly).toBe(false);
    expect(
      (await getSnapshot(alice)).tasks.filter(
        (task) => task.eventLink?.type === "local" && task.eventLink.eventId === event.id,
      ),
    ).toHaveLength(2);

    const shiftedStart = new Date(new Date(startAt).getTime() + 25 * 3600000).toISOString();
    const shifted = await saveEvent(alice, {
      ...event,
      startAt: shiftedStart,
      endAt: new Date(new Date(shiftedStart).getTime() + 3600000).toISOString(),
      allowOverlap: true,
    });
    const movedDate = localEventOccurrence(shifted, 2)!.startAt;
    const updated = (await getSnapshot(alice)).tasks.filter((task) =>
      [first.id, second.id].includes(task.id),
    );
    expect(updated.map((task) => task.dueAt)).toEqual([movedDate, movedDate]);
    const firstUpdated = updated.find((task) => task.id === first.id)!;
    await saveLog(alice, { ...logInput(firstUpdated), progressAfter: 100 });
    expect(
      (await getSnapshot(alice)).tasks.find((task) => task.id === first.id),
    ).toMatchObject({
      progress: 100,
      eventLink: link,
    });

    await deleteEvent(alice, event.id);
    const retained = (await getSnapshot(alice)).tasks.filter((task) =>
      [first.id, second.id].includes(task.id),
    );
    expect(retained.map((task) => task.dueAt)).toEqual([movedDate, movedDate]);
    expect(retained.every((task) => task.eventLink === null)).toBe(true);
    await deleteTask(alice, first.id);
    await deleteTask(alice, second.id);
  });
  it("démarre sans tag ni disponibilité", async () => {
    expect(await getSnapshot(alice)).toMatchObject({
      tags: [],
      tasks: [],
      preferences: { availability: [] },
    });
    const task = await saveTask(alice, taskInput());
    expect(task.tagIds).toEqual([]);
    await deleteTask(alice, task.id);
  });
  it("réutilise un tag normalisé même avec deux créations simultanées", async () => {
    const results = await Promise.all([
      saveTag(alice, "  Projet   perso  "),
      saveTag(alice, "PROJET PERSO"),
    ]);
    expect(results[0].id).toBe(results[1].id);
    const other = await saveTag(bob, "Projet perso");
    expect(other.id).not.toBe(results[0].id);
  });
  it("renomme partout et supprime les associations sans supprimer les tâches", async () => {
    const tag = await saveTag(alice, "À renommer");
    const secondTag = await saveTag(alice, "Réutilisable");
    const first = await saveTask(alice, { ...taskInput(), tagIds: [tag.id, secondTag.id] });
    const second = await saveTask(alice, { ...taskInput(), tagIds: [tag.id] });
    await saveTag(alice, "Nouveau nom", tag.id);
    expect((await getSnapshot(alice)).tags.find((item) => item.id === tag.id)?.name).toBe(
      "Nouveau nom",
    );
    await deleteTag(alice, tag.id);
    const snapshot = await getSnapshot(alice);
    expect(snapshot.tasks.find((item) => item.id === first.id)?.tagIds).toEqual([
      secondTag.id,
    ]);
    expect(snapshot.tasks.find((item) => item.id === second.id)?.tagIds).toEqual([]);
  });
  it("refuse toutes les associations et mutations entre deux comptes", async () => {
    const tag = await saveTag(alice, "Privé");
    const task = await saveTask(alice, taskInput("Secret"));
    const event = await saveEvent(alice, {
      title: "Privé",
      startAt: future(8),
      endAt: future(8, 11),
      weekly: false,
      repeatUntil: null,
      timeZone: "Europe/Paris",
      allowOverlap: false,
    });
    await expect(saveTask(bob, { ...taskInput(), tagIds: [tag.id] })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      saveTask(bob, {
        ...taskInput(),
        eventLink: { type: "local", eventId: event.id, occurrenceIndex: 0 },
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(saveTask(bob, task)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteTask(bob, task.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveTag(bob, "Volé", tag.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteTag(bob, tag.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveLog(bob, logInput(task))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteEvent(bob, event.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      saveSession(bob, {
        taskId: task.id,
        startAt: future(2),
        endAt: future(2, 11),
        allowOverlap: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getSnapshot(bob)).tasks.some((item) => item.id === task.id)).toBe(false);
  });
  it("enregistre une seule fois les doubles validations", async () => {
    const task = await saveTask(alice, taskInput());
    const input = logInput(task);
    const results = await Promise.all([saveLog(alice, input), saveLog(alice, input)]);
    expect(results[0].log.id).toBe(results[1].log.id);
    const snapshot = await getSnapshot(alice);
    expect(snapshot.logs.filter((item) => item.taskId === task.id)).toHaveLength(1);
    expect(snapshot.tasks.find((item) => item.id === task.id)?.progress).toBe(25);
    expect(results.map((result) => result.suggestedEstimate)).toContain(360);
  });
  it("refuse une modification concurrente et permet de corriger le dernier bilan", async () => {
    const task = await saveTask(alice, taskInput());
    const results = await Promise.allSettled([
      saveLog(alice, logInput(task)),
      saveTask(alice, { ...task, title: "Modification concurrente" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    let current = (await getSnapshot(alice)).tasks.find((item) => item.id === task.id)!;
    const latest = await saveLog(alice, logInput(current));
    current = (await getSnapshot(alice)).tasks.find((item) => item.id === task.id)!;
    await saveLog(alice, {
      ...logInput(current),
      id: latest.log.id,
      actualMinutes: 80,
      progressAfter: 30,
    });
    expect(
      (await getSnapshot(alice)).tasks.find((item) => item.id === task.id)?.progress,
    ).toBe(30);
  });
  it("revérifie les conflits en transaction et ne déplace pas une séance refusée", async () => {
    const task = await saveTask(alice, taskInput());
    const input = {
      taskId: task.id,
      startAt: future(3),
      endAt: future(3, 11),
      allowOverlap: false,
    };
    const results = await Promise.allSettled([
      saveSession(alice, input),
      saveSession(alice, input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const reserved = await saveSession(alice, {
      ...input,
      startAt: future(4),
      endAt: future(4, 11),
    });
    await expect(
      saveSession(alice, {
        ...reserved,
        startAt: input.startAt,
        endAt: input.endAt,
        allowOverlap: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await getSnapshot(alice)).sessions.find((item) => item.id === reserved.id)?.startAt,
    ).toBe(reserved.startAt);
    await expect(cancelSession(bob, reserved.id, reserved.revision)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await saveSession(alice, {
      ...reserved,
      startAt: input.startAt,
      endAt: input.endAt,
      allowOverlap: true,
    });
  });
  it("limite les parts planifiées à 100 % sans limiter la durée des séances", async () => {
    const task = await saveTask(alice, { ...taskInput(), estimatedMinutes: 60 });
    const startAt = future(20);
    const endAt = new Date(new Date(startAt).getTime() + 30 * 60000).toISOString();
    const first = await saveSession(alice, {
      taskId: task.id,
      startAt,
      endAt,
      allowOverlap: true,
    });
    expect(first.plannedPercent).toBe(50);
    let snapshot = await getSnapshot(alice);
    expect(getTaskMetrics(task, snapshot.sessions, snapshot.logs)).toMatchObject({
      plannedMinutes: 30,
      plannedPercent: 50,
      unplannedMinutes: 30,
    });

    const second = await saveSession(alice, {
      taskId: task.id,
      startAt: future(21),
      endAt: future(21, 11),
      plannedPercent: 10,
      allowOverlap: true,
    });
    expect(second.plannedPercent).toBe(10);
    snapshot = await getSnapshot(alice);
    expect(getTaskMetrics(task, snapshot.sessions, snapshot.logs)).toMatchObject({
      plannedMinutes: 90,
      plannedPercent: 60,
      unplannedMinutes: 24,
    });

    await expect(
      saveSession(alice, {
        taskId: task.id,
        startAt: future(22),
        endAt: future(22, 11),
        plannedPercent: 41,
        allowOverlap: true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const longer = await saveSession(alice, {
      taskId: task.id,
      startAt: future(22),
      endAt: future(22, 12),
      plannedPercent: 40,
      allowOverlap: true,
    });
    expect(longer.plannedPercent).toBe(40);
    snapshot = await getSnapshot(alice);
    expect(getTaskMetrics(task, snapshot.sessions, snapshot.logs)).toMatchObject({
      plannedMinutes: 210,
      plannedPercent: 100,
      unplannedMinutes: 0,
    });
    const extra = await saveSession(alice, {
      taskId: task.id,
      startAt: future(23),
      endAt: future(23, 11),
      plannedPercent: 0,
      allowOverlap: true,
    });
    expect(extra.plannedPercent).toBe(0);
  });
  it("supprime une séance sans bilan et contrôle le propriétaire et la révision", async () => {
    const task = await saveTask(alice, taskInput("Séance à supprimer"));
    const session = await saveSession(alice, {
      taskId: task.id,
      startAt: future(5),
      endAt: future(5, 11),
      allowOverlap: true,
    });

    await expect(deleteSession(bob, session.id, session.revision)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(deleteSession(alice, session.id, session.revision + 1)).rejects.toMatchObject(
      { code: "CONFLICT" },
    );

    await deleteSession(alice, session.id, session.revision);

    expect((await getSnapshot(alice)).sessions.some((item) => item.id === session.id)).toBe(
      false,
    );
    expect(
      await db.select().from(studySessions).where(eq(studySessions.id, session.id)),
    ).toHaveLength(0);
  });
  it("archive une séance avec bilan et conserve l’historique corrigeable", async () => {
    const task = await saveTask(alice, taskInput("Séance à archiver"));
    const session = await saveSession(alice, {
      taskId: task.id,
      startAt: future(-2),
      endAt: future(-2, 11),
      allowOverlap: true,
    });
    const saved = await saveLog(alice, {
      ...logInput(task),
      sessionId: session.id,
    });
    let snapshot = await getSnapshot(alice);
    const currentSession = snapshot.sessions.find((item) => item.id === session.id)!;

    await deleteSession(alice, currentSession.id, currentSession.revision);

    snapshot = await getSnapshot(alice);
    expect(snapshot.sessions.some((item) => item.id === session.id)).toBe(false);
    expect(snapshot.logs.find((item) => item.id === saved.log.id)?.sessionId).toBe(session.id);
    expect(snapshot.tasks.find((item) => item.id === task.id)?.progress).toBe(25);
    const [archived] = await db
      .select()
      .from(studySessions)
      .where(eq(studySessions.id, session.id));
    expect(archived.archivedAt).not.toBeNull();

    const currentTask = snapshot.tasks.find((item) => item.id === task.id)!;
    await saveLog(alice, {
      ...logInput(currentTask),
      id: saved.log.id,
      sessionId: session.id,
      actualMinutes: 120,
      progressAfter: 35,
    });
    expect(
      (await getSnapshot(alice)).tasks.find((item) => item.id === task.id)?.progress,
    ).toBe(35);
  });
  it("garde une séance terminée depuis deux heures prévue et réserve sa part", async () => {
    const task = await saveTask(alice, taskInput("Séance en grâce"));
    const endAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const startAt = new Date(new Date(endAt).getTime() - 60 * 60 * 1000).toISOString();
    const reserved = await saveSession(alice, {
      taskId: task.id,
      startAt,
      endAt,
      plannedPercent: 70,
      allowOverlap: true,
    });
    let snapshot = await getSnapshot(alice);
    expect(snapshot.sessions.find((item) => item.id === reserved.id)?.status).toBe("planned");
    expect(getTaskMetrics(task, snapshot.sessions, snapshot.logs)).toMatchObject({
      plannedPercent: 70,
      unplannedMinutes: 72,
    });
    await expect(
      saveSession(alice, {
        taskId: task.id,
        startAt: future(3),
        endAt: future(3, 11),
        plannedPercent: 31,
        allowOverlap: true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const next = await saveSession(alice, {
      taskId: task.id,
      startAt: future(4),
      endAt: future(4, 11),
      plannedPercent: 30,
      allowOverlap: true,
    });
    await saveLog(alice, { ...logInput(task), progressAfter: 50 });
    snapshot = await getSnapshot(alice);
    expect(snapshot.sessions.find((item) => item.id === reserved.id)?.plannedPercent).toBe(50);
    expect(snapshot.sessions.find((item) => item.id === next.id)?.plannedPercent).toBe(0);
  });
  it("permet de déclarer non faite une séance pendant sa grâce", async () => {
    const task = await saveTask(alice, taskInput("Séance manquée en grâce"));
    const endAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const reserved = await saveSession(alice, {
      taskId: task.id,
      startAt: new Date(new Date(endAt).getTime() - 60 * 60 * 1000).toISOString(),
      endAt,
      plannedPercent: 40,
      allowOverlap: true,
    });
    await saveLog(alice, {
      requestId: crypto.randomUUID(),
      taskId: task.id,
      taskRevision: task.revision,
      sessionId: reserved.id,
      missed: true,
      note: "",
    });
    const snapshot = await getSnapshot(alice);
    expect(snapshot.sessions.find((item) => item.id === reserved.id)?.status).toBe("missed");
    expect(getTaskMetrics(task, snapshot.sessions, snapshot.logs).plannedPercent).toBe(0);
  });
  it("permet d'enregistrer un bilan effectué pendant la grâce", async () => {
    const task = await saveTask(alice, taskInput("Séance effectuée en grâce"));
    const endAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const reserved = await saveSession(alice, {
      taskId: task.id,
      startAt: new Date(new Date(endAt).getTime() - 60 * 60 * 1000).toISOString(),
      endAt,
      plannedPercent: 25,
      allowOverlap: true,
    });
    const result = await saveLog(alice, {
      requestId: crypto.randomUUID(),
      taskId: task.id,
      taskRevision: task.revision,
      sessionId: reserved.id,
      actualMinutes: 60,
      progressAfter: 25,
      note: "Révision terminée",
      missed: false,
    });
    expect(result.log).toMatchObject({ actualMinutes: 60, progressAfter: 25 });
    expect(
      (await getSnapshot(alice)).sessions.find((item) => item.id === reserved.id)?.status,
    ).toBe("completed");
  });
  it("réduit les parts futures quand un bilan réel avance plus vite que prévu", async () => {
    const task = await saveTask(bob, taskInput());
    const first = await saveSession(bob, {
      taskId: task.id,
      startAt: future(24),
      endAt: future(24, 12),
      allowOverlap: true,
    });
    const second = await saveSession(bob, {
      taskId: task.id,
      startAt: future(25),
      endAt: future(25, 11),
      plannedPercent: 40,
      allowOverlap: true,
    });
    expect(first.plannedPercent).toBe(50);
    await saveLog(bob, { ...logInput(task), progressAfter: 80 });

    const snapshot = await getSnapshot(bob);
    expect(snapshot.sessions.find((item) => item.id === first.id)).toMatchObject({
      plannedPercent: 20,
      revision: first.revision + 1,
    });
    expect(snapshot.sessions.find((item) => item.id === second.id)).toMatchObject({
      plannedPercent: 0,
      revision: second.revision + 1,
    });
    expect(
      getTaskMetrics({ ...task, progress: 80 }, snapshot.sessions, snapshot.logs),
    ).toMatchObject({
      plannedPercent: 20,
      unplannedMinutes: 0,
    });
  });
  it("à 100 %, annule les futures séances et garde leur historique", async () => {
    const task = await saveTask(bob, taskInput());
    const reserved = await saveSession(bob, {
      taskId: task.id,
      startAt: future(5),
      endAt: future(5, 11),
      allowOverlap: false,
    });
    await saveLog(bob, { ...logInput(task), progressAfter: 100 });
    expect(
      (await getSnapshot(bob)).sessions.find((item) => item.id === reserved.id),
    ).toMatchObject({ status: "cancelled", cancellationReason: "task-completed" });
    await expect(
      saveSession(bob, {
        taskId: task.id,
        startAt: future(6),
        endAt: future(6, 11),
        allowOverlap: false,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("isole les préférences et refuse un conflit avec un événement hebdomadaire", async () => {
    await savePreferences(bob, {
      timeZone: "America/Montreal",
      theme: "dark",
      availability: [],
    });
    expect((await getSnapshot(alice)).preferences.timeZone).toBe("Europe/Paris");
    const task = await saveTask(bob, taskInput());
    await saveEvent(bob, {
      title: "Cours",
      startAt: future(9),
      endAt: future(9, 11),
      weekly: true,
      repeatUntil: null,
      timeZone: "Europe/Paris",
      allowOverlap: false,
    });
    await expect(
      saveSession(bob, {
        taskId: task.id,
        startAt: future(16),
        endAt: future(16, 11),
        allowOverlap: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("détecte un conflit de séries qui apparaît au changement d’heure suivant", async () => {
    await saveEvent(alice, {
      title: "Rendez-vous à New York",
      startAt: "2027-03-02T15:00:00Z",
      endAt: "2027-03-02T16:00:00Z",
      timeZone: "America/New_York",
      weekly: true,
      repeatUntil: "2027-04-10",
      allowOverlap: false,
    });
    await expect(
      saveEvent(alice, {
        title: "Cours à Paris",
        startAt: "2027-03-02T14:00:00Z",
        endAt: "2027-03-02T15:00:00Z",
        timeZone: "Europe/Paris",
        weekly: true,
        repeatUntil: "2027-04-10",
        allowOverlap: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("enregistre une séance manquée sans avancement et refuse la correction d’un ancien bilan", async () => {
    const task = await saveTask(alice, taskInput());
    const session = await saveSession(alice, {
      taskId: task.id,
      startAt: future(-3),
      endAt: future(-3, 11),
      allowOverlap: false,
    });
    let snapshot = await getSnapshot(alice);
    expect(snapshot.sessions.find((item) => item.id === session.id)?.status).toBe("expired");
    expect(snapshot.logs.some((item) => item.sessionId === session.id)).toBe(false);
    const missed = await saveLog(alice, {
      requestId: crypto.randomUUID(),
      taskId: task.id,
      taskRevision: task.revision,
      sessionId: session.id,
      note: "",
      missed: true,
    });
    expect(missed.log.progressAfter).toBe(0);
    expect(missed.log.actualMinutes).toBe(0);
    expect(missed.log.note).toBe("");
    snapshot = await getSnapshot(alice);
    expect(snapshot.sessions.find((item) => item.id === session.id)?.status).toBe("missed");
    let current = snapshot.tasks.find((item) => item.id === task.id)!;
    const actual = await saveLog(alice, logInput(current));
    expect(actual.log).toMatchObject({
      sessionId: null,
      actualMinutes: 90,
      progressBefore: 0,
      progressAfter: 25,
    });
    snapshot = await getSnapshot(alice);
    current = snapshot.tasks.find((item) => item.id === task.id)!;
    await expect(
      saveLog(alice, { ...logInput(current), id: missed.log.id, sessionId: session.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("permet de déclarer effectuée une séance expirée avec une note", async () => {
    const task = await saveTask(alice, taskInput());
    const session = await saveSession(alice, {
      taskId: task.id,
      startAt: future(-2),
      endAt: future(-2, 11),
      allowOverlap: false,
    });
    const result = await saveLog(alice, {
      requestId: crypto.randomUUID(),
      taskId: task.id,
      taskRevision: task.revision,
      sessionId: session.id,
      actualMinutes: 75,
      progressAfter: 20,
      note: "Chapitre terminé",
      missed: false,
    });
    expect(result.log).toMatchObject({
      actualStartAt: session.startAt,
      actualMinutes: 75,
      progressAfter: 20,
      note: "Chapitre terminé",
    });
    expect(
      (await getSnapshot(alice)).sessions.find((item) => item.id === session.id)?.status,
    ).toBe("completed");
  });
});
