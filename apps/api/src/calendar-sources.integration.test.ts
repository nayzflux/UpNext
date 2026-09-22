import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { db, pool } from "./db";
import { calendarSources, user } from "./db/schema";
import {
  deleteCalendarSource,
  getImportedEvents,
  syncCalendarSource,
  syncCalendarSources,
} from "./calendar-sources";
import { saveSession, saveTask } from "./mutations";

const alice = crypto.randomUUID();
const bob = crypto.randomUUID();
const start = new Date(Date.now() + 150 * 86400000);
start.setUTCHours(10, 0, 0, 0);
const end = new Date(start.getTime() + 3600000);
const icsDate = (date: Date) => date.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
const calendar = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:meeting\r\nDTSTAMP:20260101T000000Z\r\nSUMMARY:Réunion\r\nDTSTART:${icsDate(start)}\r\nDTEND:${icsDate(end)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  await db.insert(user).values([
    { id: alice, name: "Alice ICS", email: `${alice}@example.test`, emailVerified: true },
    { id: bob, name: "Bob ICS", email: `${bob}@example.test`, emailVerified: true },
  ]);
});
afterAll(async () => {
  await db.delete(user).where(inArray(user.id, [alice, bob]));
  await pool.end();
});

describe("sources ICS et planning", () => {
  it("synchronise, conserve le flux valide lors d’une erreur et respecte le délai horaire", async () => {
    const [source] = await db.insert(calendarSources).values({ userId: alice, name: "Université", url: "https://example.org/calendar.ics" }).returning();
    const download = vi.fn().mockResolvedValueOnce({ status: 200, content: calendar, etag: '"v1"' });
    await syncCalendarSource(alice, source.id, false, download);
    expect(download).toHaveBeenCalledTimes(1);
    expect(await getImportedEvents(alice, start.toISOString(), end.toISOString())).toHaveLength(1);
    expect(await getImportedEvents(bob, start.toISOString(), end.toISOString())).toHaveLength(0);

    await syncCalendarSource(alice, source.id, false, download);
    expect(download).toHaveBeenCalledTimes(1);
    const unchanged = vi.fn().mockResolvedValue({ status: 304 });
    await syncCalendarSource(alice, source.id, true, unchanged);
    expect(unchanged).toHaveBeenCalledWith(source.url, '"v1"', null);
    const broken = vi.fn().mockResolvedValue({ status: 200, content: "pas un ICS" });
    await syncCalendarSource(alice, source.id, true, broken);
    const [afterError] = await db.select().from(calendarSources).where(eq(calendarSources.id, source.id));
    expect(afterError.content).toBe(calendar);
    expect(afterError.error).toBeTruthy();
    await expect(syncCalendarSources(bob, true, source.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const task = await saveTask(alice, {
      title: "Travail", notes: "", priority: "normal", dueAt: new Date(start.getTime() + 7 * 86400000).toISOString(),
      dateOnly: false, estimatedMinutes: 60, tagIds: [], eventId: null,
    });
    await expect(saveSession(alice, {
      taskId: task.id, startAt: start.toISOString(), endAt: end.toISOString(), allowOverlap: false,
    })).rejects.toMatchObject({ code: "CONFLICT" });
    await deleteCalendarSource(alice, source.id);
    expect(await getImportedEvents(alice, start.toISOString(), end.toISOString())).toHaveLength(0);
    expect(await db.select().from(calendarSources).where(and(eq(calendarSources.id, source.id), eq(calendarSources.userId, alice)))).toHaveLength(0);
  });
});
