import { describe, expect, it } from "vitest";
import { type Session, type Task } from "@upnext/contracts";
import {
  createPreview,
  dayBlocks,
  pixelsPerMinute,
  resizeDuration,
  snapMinute,
  visibleHours,
} from "./calendar-layout";

const task: Task = {
  id: crypto.randomUUID(),
  title: "Deux heures de travail",
  estimatedMinutes: 120,
  progress: 0,
  priority: "normal",
  notes: "",
  dueAt: "2026-09-23T21:59:00Z",
  dateOnly: true,
  tagIds: [],
  eventId: null,
  revision: 0,
  createdAt: "2026-09-20T10:00:00Z",
};
const session: Session = {
  id: crypto.randomUUID(),
  taskId: task.id,
  startAt: "2026-09-21T08:00:00.000Z",
  endAt: "2026-09-21T10:00:00.000Z",
  status: "planned",
  cancellationReason: null,
  revision: 0,
};

describe("géométrie du calendrier", () => {
  it("arrondit chaque déplacement au quart d’heure", () => {
    expect(snapMinute(601)).toBe(600);
    expect(snapMinute(609)).toBe(615);
    expect(snapMinute(-30)).toBe(0);
    expect(snapMinute(1500)).toBe(1425);
  });
  it("conserve la durée de deux heures dans l’aperçu et après dépôt", () => {
    const preview = createPreview(
      { kind: "session", session },
      "2026-09-22",
      609,
      "Europe/Paris",
    );
    const projected = dayBlocks(
      "2026-09-22",
      "Europe/Paris",
      [task],
      [session],
      [],
      preview,
    )[0];
    const saved = dayBlocks(
      "2026-09-22",
      "Europe/Paris",
      [task],
      [{ ...session, startAt: preview.startAt, endAt: preview.endAt }],
      [],
    )[0];
    expect(projected.start).toBe(615);
    expect(projected.end - projected.start).toBe(120);
    expect((projected.end - projected.start) * pixelsPerMinute).toBe(
      (saved.end - saved.start) * pixelsPerMinute,
    );
    expect([projected.lane, projected.lanes]).toEqual([saved.lane, saved.lanes]);
  });
  it("utilise la durée choisie pour une tâche déplacée depuis la liste", () => {
    const preview = createPreview(
      { kind: "task", task, durationMinutes: 90 },
      "2026-09-22",
      600,
      "Europe/Paris",
    );
    expect(new Date(preview.endAt).getTime() - new Date(preview.startAt).getTime()).toBe(
      90 * 60000,
    );
  });
  it("redimensionne la carte d’origine en gardant son début et son identifiant", () => {
    const duration = resizeDuration(120, 30 * pixelsPerMinute);
    const preview = createPreview(
      { kind: "resize", session },
      "2026-09-21",
      0,
      "Europe/Paris",
      duration,
    );
    const block = dayBlocks("2026-09-21", "Europe/Paris", [task], [session], [], preview)[0];
    expect(block.session?.id).toBe(session.id);
    expect(block.startAt).toBe(session.startAt);
    expect(block.resizing).toBe(true);
    expect(block.preview).toBeUndefined();
    expect(block.end - block.start).toBe(150);
    expect(resizeDuration(120, -1000)).toBe(15);
    expect(resizeDuration(120, 3000)).toBe(1440);
  });
  it("élargit les heures visibles pour ne cacher aucune séance", () => {
    const early = {
      ...session,
      startAt: "2026-09-21T03:00:00Z",
      endAt: "2026-09-21T05:00:00Z",
    };
    const blocks = dayBlocks("2026-09-21", "Europe/Paris", [task], [early], []);
    expect(visibleHours(blocks, false)).toEqual({ start: 300, end: 1200 });
    expect(visibleHours(blocks, true)).toEqual({ start: 0, end: 1440 });
  });
});
