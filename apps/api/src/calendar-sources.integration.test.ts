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
import { getSnapshot } from "./data";
import { localDate } from "@upnext/contracts";

const alice = crypto.randomUUID();
const bob = crypto.randomUUID();
const start = new Date(Date.now() + 150 * 86400000);
start.setUTCHours(10, 0, 0, 0);
const end = new Date(start.getTime() + 3600000);
const icsDate = (date: Date) => date.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
const calendar = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:meeting\r\nDTSTAMP:20260101T000000Z\r\nSUMMARY:Réunion\r\nDTSTART:${icsDate(start)}\r\nDTEND:${icsDate(end)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
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
  it("suit un événement externe déplacé, garde les liens sur erreur et détache les événements disparus", async () => {
    const [source] = await db
      .insert(calendarSources)
      .values({
        userId: alice,
        name: "Examens",
        url: "https://example.org/exams.ics",
      })
      .returning();
    const allDayDate = start.toISOString().slice(0, 10).replace(/-/g, "");
    const allDayEvent = `BEGIN:VEVENT\r\nUID:holiday\r\nDTSTAMP:20260101T000000Z\r\nSUMMARY:Journée\r\nDTSTART;VALUE=DATE:${allDayDate}\r\nDTEND;VALUE=DATE:${new Date(start.getTime() + 86400000).toISOString().slice(0, 10).replace(/-/g, "")}\r\nEND:VEVENT\r\n`;
    const feed = (meetingStart: Date | null) =>
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${meetingStart ? `BEGIN:VEVENT\r\nUID:meeting\r\nDTSTAMP:20260101T000000Z\r\nSUMMARY:Réunion\r\nDTSTART:${icsDate(meetingStart)}\r\nDTEND:${icsDate(new Date(meetingStart.getTime() + 3600000))}\r\nEND:VEVENT\r\n` : ""}${allDayEvent}END:VCALENDAR\r\n`;
    await syncCalendarSource(
      alice,
      source.id,
      true,
      vi.fn().mockResolvedValue({ status: 200, content: feed(start) }),
    );
    const meeting = await saveTask(alice, {
      title: "Préparer la réunion",
      notes: "",
      priority: "normal",
      dueAt: end.toISOString(),
      dateOnly: false,
      estimatedMinutes: 60,
      tagIds: [],
      eventLink: { type: "imported", sourceId: source.id, uid: "meeting", recurrenceId: null },
    });
    const holiday = await saveTask(alice, {
      title: "Préparer la journée",
      notes: "",
      priority: "normal",
      dueAt: end.toISOString(),
      dateOnly: false,
      estimatedMinutes: 60,
      tagIds: [],
      eventLink: { type: "imported", sourceId: source.id, uid: "holiday", recurrenceId: null },
    });
    expect(meeting.dueAt).toBe(start.toISOString());
    expect(holiday.dateOnly).toBe(true);
    expect(localDate(holiday.dueAt, "Europe/Paris")).toBe(start.toISOString().slice(0, 10));

    const moved = new Date(start.getTime() + 86400000);
    await syncCalendarSource(
      alice,
      source.id,
      true,
      vi.fn().mockResolvedValue({ status: 200, content: feed(moved) }),
    );
    let tasks = (await getSnapshot(alice)).tasks;
    expect(tasks.find((task) => task.id === meeting.id)?.dueAt).toBe(moved.toISOString());
    expect(tasks.find((task) => task.id === meeting.id)?.eventLink).toEqual(meeting.eventLink);

    await syncCalendarSource(
      alice,
      source.id,
      true,
      vi.fn().mockResolvedValue({ status: 200, content: "broken" }),
    );
    tasks = (await getSnapshot(alice)).tasks;
    expect(tasks.find((task) => task.id === meeting.id)?.dueAt).toBe(moved.toISOString());
    expect(tasks.find((task) => task.id === meeting.id)?.eventLink).toEqual(meeting.eventLink);

    await syncCalendarSource(
      alice,
      source.id,
      true,
      vi.fn().mockResolvedValue({ status: 200, content: feed(null) }),
    );
    tasks = (await getSnapshot(alice)).tasks;
    expect(tasks.find((task) => task.id === meeting.id)).toMatchObject({
      dueAt: moved.toISOString(),
      eventLink: null,
    });
    expect(tasks.find((task) => task.id === holiday.id)?.eventLink).toEqual(holiday.eventLink);
    await deleteCalendarSource(alice, source.id);
    tasks = (await getSnapshot(alice)).tasks;
    expect(tasks.find((task) => task.id === holiday.id)).toMatchObject({
      dueAt: holiday.dueAt,
      eventLink: null,
    });
  });
  it("synchronise, conserve le flux valide lors d’une erreur et respecte le délai horaire", async () => {
    const [source] = await db
      .insert(calendarSources)
      .values({ userId: alice, name: "Université", url: "https://example.org/calendar.ics" })
      .returning();
    const download = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, content: calendar, etag: '"v1"' });
    await syncCalendarSource(alice, source.id, false, download);
    expect(download).toHaveBeenCalledTimes(1);
    expect(
      await getImportedEvents(alice, start.toISOString(), end.toISOString()),
    ).toHaveLength(1);
    expect(await getImportedEvents(bob, start.toISOString(), end.toISOString())).toHaveLength(
      0,
    );

    await syncCalendarSource(alice, source.id, false, download);
    expect(download).toHaveBeenCalledTimes(1);
    const unchanged = vi.fn().mockResolvedValue({ status: 304 });
    await syncCalendarSource(alice, source.id, true, unchanged);
    expect(unchanged).toHaveBeenCalledWith(source.url, '"v1"', null);
    const broken = vi.fn().mockResolvedValue({ status: 200, content: "pas un ICS" });
    await syncCalendarSource(alice, source.id, true, broken);
    const [afterError] = await db
      .select()
      .from(calendarSources)
      .where(eq(calendarSources.id, source.id));
    expect(afterError.content).toBe(calendar);
    expect(afterError.error).toBeTruthy();
    await expect(syncCalendarSources(bob, true, source.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const task = await saveTask(alice, {
      title: "Travail",
      notes: "",
      priority: "normal",
      dueAt: new Date(start.getTime() + 7 * 86400000).toISOString(),
      dateOnly: false,
      estimatedMinutes: 60,
      tagIds: [],
      eventLink: null,
    });
    await expect(
      saveSession(alice, {
        taskId: task.id,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        allowOverlap: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await deleteCalendarSource(alice, source.id);
    expect(
      await getImportedEvents(alice, start.toISOString(), end.toISOString()),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(calendarSources)
        .where(and(eq(calendarSources.id, source.id), eq(calendarSources.userId, alice))),
    ).toHaveLength(0);
  });
});
