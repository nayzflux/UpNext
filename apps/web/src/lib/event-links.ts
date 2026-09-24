import type { EventLink, EventOccurrence, ImportedEvent, Task } from "@upnext/contracts";

export type SelectableEvent = EventOccurrence | ImportedEvent;

export function eventLinkFor(event: SelectableEvent): EventLink {
  return "sourceId" in event
    ? {
        type: "imported",
        sourceId: event.sourceId,
        uid: event.uid,
        recurrenceId: event.recurrenceId,
      }
    : { type: "local", eventId: event.id, occurrenceIndex: event.occurrenceIndex };
}

export function sameEventLink(a: EventLink | null, b: EventLink | null) {
  if (!a || !b || a.type !== b.type) return false;
  return a.type === "local" && b.type === "local"
    ? a.eventId === b.eventId && a.occurrenceIndex === b.occurrenceIndex
    : a.type === "imported" &&
        b.type === "imported" &&
        a.sourceId === b.sourceId &&
        a.uid === b.uid &&
        a.recurrenceId === b.recurrenceId;
}

export function tasksForEvent(tasks: Task[], event: SelectableEvent) {
  const link = eventLinkFor(event);
  return tasks.filter((task) => sameEventLink(task.eventLink, link));
}
