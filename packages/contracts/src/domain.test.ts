import { describe, expect, it } from "vitest";
import {
  defaultSessionPercent,
  expandEvents,
  getTaskMetrics,
  localTime,
  normalizeTagName,
  overlaps,
  percentageToMinutes,
  suggestedEstimate,
  suggestSlots,
  zonedInstant,
} from "./domain";
import {
  taskFieldsSchema,
  type CalendarEvent,
  type Preferences,
  type Session,
  type Task,
  type WorkLog,
} from "./schemas";

const now = new Date("2026-03-23T08:00:00Z");
const task: Task = {
  id: crypto.randomUUID(),
  title: "Préparer le DS",
  notes: "",
  priority: "normal",
  dueAt: "2026-04-20T20:00:00Z",
  dateOnly: true,
  estimatedMinutes: 240,
  tagIds: [],
  eventId: null,
  progress: 25,
  revision: 0,
  createdAt: now.toISOString(),
};
const preferences: Preferences = {
  timeZone: "Europe/Paris",
  theme: "system",
  availability: [{ weekday: 2, startTime: "17:00", endTime: "20:00" }],
};
function session(startAt: string, endAt: string): Session {
  return {
    id: crypto.randomUUID(),
    taskId: task.id,
    startAt,
    endAt,
    plannedPercent: defaultSessionPercent(
      (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000,
      task.estimatedMinutes,
    ),
    status: "planned",
    cancellationReason: null,
    revision: 0,
  };
}
function log(actualStartAt: string, actualMinutes = 90): WorkLog {
  return {
    id: crypto.randomUUID(),
    taskId: task.id,
    sessionId: null,
    actualStartAt,
    actualMinutes,
    progressBefore: 0,
    progressAfter: 25,
    note: "",
    missed: false,
    createdAt: actualStartAt,
  };
}
function weekly(startAt: string, endAt: string): CalendarEvent {
  return {
    id: crypto.randomUUID(),
    title: "Cours",
    startAt,
    endAt,
    timeZone: "Europe/Paris",
    weekly: true,
    repeatUntil: null,
    revision: 0,
  };
}
function suggestions(overrides: Partial<Parameters<typeof suggestSlots>[0]> = {}) {
  return suggestSlots({
    task,
    preferences,
    now,
    durationMinutes: 60,
    sessions: [],
    events: [],
    logs: [],
    ...overrides,
  });
}

describe("tâches, tags et avancement", () => {
  it("autorise une tâche sans tag et normalise les noms", () => {
    expect(taskFieldsSchema.parse(task).tagIds).toEqual([]);
    expect(normalizeTagName("  Révision   DS  ")).toBe("révision ds");
    expect(normalizeTagName("Re\u0301vision")).toBe(normalizeTagName("RÉVISION"));
  });
  it("applique l’exemple de 4 h, 25 % réalisés et 1 h encore réservée", () => {
    const metrics = getTaskMetrics(
      task,
      [session("2026-03-24T17:00:00Z", "2026-03-24T18:00:00Z")],
      [log("2026-03-22T14:00:00Z")],
      now,
    );
    expect(metrics).toEqual({
      remainingMinutes: 180,
      plannedMinutes: 60,
      plannedPercent: 25,
      actualMinutes: 90,
      unplannedMinutes: 120,
      planning: "partial",
    });
  });
  it("une réservation passée sans bilan ne couvre plus le travail", () => {
    const past = session("2026-03-22T15:00:00Z", "2026-03-22T19:00:00Z");
    expect(getTaskMetrics(task, [past], [], now)).toMatchObject({
      plannedMinutes: 0,
      plannedPercent: 0,
      unplannedMinutes: 180,
      planning: "none",
    });
    expect(past.status).toBe("planned");
  });
  it("ne produit jamais de durée négative en cas de sur-réservation", () => {
    expect(
      getTaskMetrics(task, [session("2026-03-24T10:00:00Z", "2026-03-24T15:00:00Z")], [], now),
    ).toMatchObject({ unplannedMinutes: 0, planning: "full" });
  });
  it("retire les séances futures du reste à planifier selon leur part, sans lier part et durée", () => {
    const future = session("2026-03-24T10:00:00Z", "2026-03-24T10:30:00Z");
    const shortTask = { ...task, estimatedMinutes: 60, progress: 25 };
    const defaultShare = { ...future, plannedPercent: 50 };

    expect(getTaskMetrics(shortTask, [defaultShare], [], now)).toMatchObject({
      remainingMinutes: 45,
      plannedMinutes: 30,
      plannedPercent: 50,
      unplannedMinutes: 15,
      planning: "partial",
    });
    expect(
      getTaskMetrics(shortTask, [{ ...defaultShare, plannedPercent: 10 }], [], now),
    ).toMatchObject({ plannedMinutes: 30, plannedPercent: 10, unplannedMinutes: 39 });
  });
  it("ne crédite pas la durée prévue d’une séance passée, mais l’avancement réel du bilan", () => {
    const past = session("2026-03-22T10:00:00Z", "2026-03-22T10:30:00Z");
    const shortTask = { ...task, estimatedMinutes: 60, progress: 25 };

    expect(getTaskMetrics(shortTask, [past], [log(past.startAt, 45)], now)).toMatchObject({
      remainingMinutes: 45,
      plannedMinutes: 0,
      plannedPercent: 0,
      actualMinutes: 45,
      unplannedMinutes: 45,
    });
    expect(
      getTaskMetrics(shortTask, [{ ...past, status: "completed" }], [log(past.startAt)], now),
    ).toMatchObject({ remainingMinutes: 45, unplannedMinutes: 45 });
  });
  it("retourne l’état planning 'done' lorsque la tâche est terminée (100 %)", () => {
    expect(getTaskMetrics({ ...task, progress: 100 }, [], [], now)).toMatchObject({
      remainingMinutes: 0,
      unplannedMinutes: 0,
      planning: "done",
    });
  });
  it("convertit 50 % de 4 h en 2 h sans modifier les réservations", () => {
    expect(percentageToMinutes(50, 240)).toBe(120);
    const reserved = session("2026-03-24T10:00:00Z", "2026-03-24T12:00:00Z");
    expect(
      getTaskMetrics({ ...task, estimatedMinutes: 360 }, [reserved], [], now).plannedMinutes,
    ).toBe(120);
  });
  it("propose une réévaluation facultative arrondie aux 5 minutes supérieures", () => {
    expect(suggestedEstimate(240, 90, 25)).toBe(360);
    expect(suggestedEstimate(100, 41, 30)).toBe(140);
    expect(suggestedEstimate(100, 30, 24)).toBe(125);
    expect(suggestedEstimate(240, 29, 10)).toBeNull();
    expect(suggestedEstimate(240, 90, 9)).toBeNull();
    expect(suggestedEstimate(240, 90, 100)).toBeNull();
    expect(suggestedEstimate(240, 60, 25)).toBeNull();
  });
});

describe("fuseaux et répétitions", () => {
  it("conserve l’horaire local lors des passages à l’heure d’été et d’hiver", () => {
    const spring = expandEvents(
      [weekly("2026-03-22T17:00:00Z", "2026-03-22T18:00:00Z")],
      "2026-03-22T00:00:00Z",
      "2026-04-01T00:00:00Z",
    );
    expect(spring.map((event) => event.startAt)).toEqual([
      "2026-03-22T17:00:00.000Z",
      "2026-03-29T16:00:00.000Z",
    ]);
    const autumn = expandEvents(
      [weekly("2026-10-18T16:00:00Z", "2026-10-18T17:00:00Z")],
      "2026-10-18T00:00:00Z",
      "2026-10-26T00:00:00Z",
    );
    expect(autumn.map((event) => localTime(event.startAt, "Europe/Paris"))).toEqual([
      "18:00",
      "18:00",
    ]);
    expect(autumn[1].startAt).toBe("2026-10-25T17:00:00.000Z");
  });
  it("refuse une heure inexistante et omet cette occurrence hebdomadaire", () => {
    expect(() => zonedInstant("2026-03-29", "02:30", "Europe/Paris")).toThrow("n’existe pas");
    expect(
      expandEvents(
        [weekly("2026-03-22T01:30:00Z", "2026-03-22T02:30:00Z")],
        "2026-03-29T00:00:00Z",
        "2026-03-30T00:00:00Z",
      ),
    ).toEqual([]);
  });
  it("respecte la fin de série et les événements à cheval sur minuit", () => {
    const event = {
      ...weekly("2026-03-24T22:00:00Z", "2026-03-25T00:00:00Z"),
      repeatUntil: "2026-03-24",
    };
    const occurrences = expandEvents([event], "2026-03-24T00:00:00Z", "2026-04-03T00:00:00Z");
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].endAt).toBe("2026-03-25T00:00:00.000Z");
  });
  it("autorise deux créneaux adjacents", () => {
    expect(
      overlaps(
        { startAt: "2026-03-24T10:00:00Z", endAt: "2026-03-24T11:00:00Z" },
        { startAt: "2026-03-24T11:00:00Z", endAt: "2026-03-24T12:00:00Z" },
      ),
    ).toBe(false);
  });
});

describe("suggestions déterministes", () => {
  it("propose des disponibilités sans inventer d’habitudes", () => {
    const slots = suggestions();
    expect(slots).toHaveLength(3);
    expect(slots[0].startAt).toBe("2026-03-24T16:00:00.000Z");
    expect(slots.every((slot) => !slot.learned)).toBe(true);
    expect(slots).toEqual(suggestions());
  });
  it("favorise les habitudes déclarées récentes et non les réservations", () => {
    const slots = suggestions({
      logs: [
        log("2026-03-17T17:00:00Z"),
        log("2026-03-10T17:00:00Z"),
        log("2026-03-03T17:00:00Z"),
      ],
    });
    expect(slots[0]).toMatchObject({ startAt: "2026-03-24T17:00:00.000Z", learned: true });
    expect(slots[0].reason).toContain("mardi");
  });
  it("exclut les créneaux occupés, les échéances et les dates au-delà de 4 semaines", () => {
    const busy = session("2026-03-24T16:00:00Z", "2026-03-24T17:00:00Z");
    const slots = suggestions({
      task: { ...task, dueAt: "2026-03-24T18:00:00Z" },
      sessions: [busy],
    });
    expect(slots).toHaveLength(1);
    expect(overlaps(busy, slots[0])).toBe(false);
    expect(slots[0].endAt).toBe("2026-03-24T18:00:00.000Z");
    expect(
      suggestions({ task: { ...task, dueAt: "2027-01-01T00:00:00Z" } }).every(
        (slot) => new Date(slot.endAt).getTime() <= now.getTime() + 28 * 86400000,
      ),
    ).toBe(true);
  });
  it("observe toute la durée réellement travaillée, y compris après minuit", () => {
    const slots = suggestions({
      logs: [
        log("2026-03-16T22:00:00Z", 240),
        log("2026-03-09T22:00:00Z", 240),
        log("2026-03-02T22:00:00Z", 240),
      ],
      preferences: {
        ...preferences,
        availability: [{ weekday: 2, startTime: "01:00", endTime: "04:00" }],
      },
    });
    expect(slots[0]).toMatchObject({
      startAt: "2026-03-24T00:00:00.000Z",
      learned: true,
    });
    expect(slots[0].reason).toContain("mardi");
  });
  it("retourne zéro résultat sans disponibilité ou après échéance", () => {
    expect(suggestions({ preferences: { ...preferences, availability: [] } })).toEqual([]);
    expect(suggestions({ task: { ...task, dueAt: now.toISOString() } })).toEqual([]);
  });
  it("gère les disponibilités pendant un changement d’heure", () => {
    const slots = suggestions({
      now: new Date("2026-03-28T23:00:00Z"),
      task: { ...task, dueAt: "2026-03-29T04:00:00Z" },
      preferences: {
        ...preferences,
        availability: [{ weekday: 7, startTime: "02:00", endTime: "04:00" }],
      },
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].startAt).toBe("2026-03-29T01:00:00.000Z");
  });
});
