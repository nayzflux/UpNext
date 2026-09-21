import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { db, pool } from "./db";
import { user } from "./db/schema";
import { getSnapshot } from "./data";
import {
  cancelSession,
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
import { taskFieldsSchema, type Task } from "@upnext/contracts";

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
  actualStartAt: future(-1),
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
    await expect(saveTask(bob, { ...taskInput(), eventId: event.id })).rejects.toMatchObject({
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
      actualMinutes: 100,
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
});
