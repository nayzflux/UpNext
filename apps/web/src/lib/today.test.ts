import { describe, expect, it } from "vitest";
import type { ImportedEvent, Session, Task } from "@upnext/contracts";
import type { CalendarBlock } from "./calendar-layout";
import {
  groupDueTasks,
  remainingTodayBlocks,
  sessionsForDay,
  summarizeUnplannedTasks,
} from "./today";

function task(title: string, dueAt: string, progress = 0, estimatedMinutes = 120): Task {
  return {
    id: crypto.randomUUID(),
    title,
    notes: "",
    priority: "normal",
    dueAt,
    dateOnly: true,
    estimatedMinutes,
    tagIds: [],
    eventId: null,
    progress,
    revision: 0,
    createdAt: "2026-09-20T10:00:00Z",
  };
}

function session(taskId: string, status: Session["status"], startAt: string, endAt: string) {
  return {
    id: crypto.randomUUID(),
    taskId,
    startAt,
    endAt,
    plannedPercent: 25,
    status,
    cancellationReason: status === "cancelled" ? ("manual" as const) : null,
    revision: 0,
  } satisfies Session;
}

describe("page Aujourd’hui", () => {
  it("classe les échéances avec la date locale autour de minuit", () => {
    const now = new Date("2026-09-21T22:30:00Z");
    const late = task("En retard", "2026-09-21T21:59:00Z");
    const today = task("Aujourd’hui", "2026-09-22T21:59:00Z");
    const tomorrow = task("Demain", "2026-09-23T21:59:00Z");
    const done = task("Terminée", "2026-09-22T21:59:00Z", 100);

    const result = groupDueTasks([tomorrow, today, done, late], now, "Europe/Paris");

    expect(result.overdue.map((item) => item.title)).toEqual(["En retard"]);
    expect(result.dueToday.map((item) => item.title)).toEqual(["Aujourd’hui"]);
    expect(result.attention).toHaveLength(2);
  });

  it("garde les séances qui chevauchent la journée et exclut les annulations", () => {
    const taskId = crypto.randomUUID();
    const previousEvening = session(
      taskId,
      "planned",
      "2026-09-21T21:30:00Z",
      "2026-09-21T22:30:00Z",
    );
    const cancelled = session(
      taskId,
      "cancelled",
      "2026-09-22T08:00:00Z",
      "2026-09-22T09:00:00Z",
    );

    expect(sessionsForDay([cancelled, previousEvening], "2026-09-22", "Europe/Paris")).toEqual(
      [previousEvening],
    );
  });

  it("compte seulement le temps qui reste réellement à planifier", () => {
    const partial = task("Partielle", "2026-09-25T21:59:00Z", 25);
    const fullyPlanned = task("Déjà placée", "2026-09-26T21:59:00Z");
    const sessions = [
      session(partial.id, "planned", "2026-09-23T08:00:00Z", "2026-09-23T09:00:00Z"),
      {
        ...session(fullyPlanned.id, "planned", "2026-09-24T08:00:00Z", "2026-09-24T10:00:00Z"),
        plannedPercent: 100,
      },
    ];

    const result = summarizeUnplannedTasks(
      [fullyPlanned, partial],
      sessions,
      [],
      new Date("2026-09-22T08:00:00Z"),
    );

    expect(result.items.map((item) => item.task.title)).toEqual(["Partielle"]);
    expect(result.totalMinutes).toBe(60);
  });

  it("masque les créneaux finis, coupe celui en cours et conserve la journée entière", () => {
    const importedEvent: ImportedEvent = {
      id: "external",
      occurrenceId: "external:2026-09-22",
      sourceId: crypto.randomUUID(),
      sourceName: "Université",
      title: "Journée portes ouvertes",
      startAt: "2026-09-21T22:00:00Z",
      endAt: "2026-09-22T22:00:00Z",
      allDay: true,
    };
    const block = (id: string, start: number, end: number): CalendarBlock => ({
      id,
      title: id,
      start,
      end,
      startAt: "2026-09-22T08:00:00Z",
      endAt: "2026-09-22T09:00:00Z",
      lane: 0,
      lanes: 1,
    });
    const allDay = { ...block("all-day", 0, 1440), event: importedEvent };

    const result = remainingTodayBlocks(
      [
        block("fini", 540, 600),
        block("en-cours", 600, 660),
        block("à-venir", 720, 780),
        allDay,
      ],
      new Date("2026-09-22T08:30:00Z"),
      "Europe/Paris",
    );

    expect(result.currentMinute).toBe(630);
    expect(result.timed.map((item) => [item.id, item.visibleStart])).toEqual([
      ["en-cours", 630],
      ["à-venir", 720],
    ]);
    expect(result.allDay).toEqual([allDay]);
  });
});
