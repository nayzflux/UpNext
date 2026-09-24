import ICAL from "ical.js";
import { overlaps, zonedInstant, type ImportedEvent } from "@upnext/contracts";

export type SourceContent = { id: string; name: string; content: string | null };

export function parseCalendar(content: string) {
  if (/(?:^|\r?\n)\s*<(?:br\b|html\b|!doctype\s+html\b)/i.test(content)) {
    throw new Error(
      "Le serveur du calendrier a renvoyé du HTML au lieu d’un flux ICS valide.",
    );
  }
  const component = new ICAL.Component(ICAL.parse(content));
  if (component.name !== "vcalendar")
    throw new Error("Le flux ne contient pas de calendrier ICS.");
  for (const item of component.getAllSubcomponents("vevent")) {
    if (!item.getFirstPropertyValue("uid") || !item.getFirstPropertyValue("dtstart")) {
      throw new Error("Le flux contient un événement incomplet.");
    }
  }
  return component;
}

function instant(time: ICAL.Time, accountZone: string, propertyZone?: string | null) {
  const date = `${String(time.year).padStart(4, "0")}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
  const clock = `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
  const zone = propertyZone || time.zone?.tzid;
  if (time.isDate || !zone || zone === "floating")
    return zonedInstant(date, time.isDate ? "00:00" : clock, accountZone);
  if (zone === "UTC" || zone === "Z") return time.toJSDate().toISOString();
  let iana = false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    iana = true;
  } catch {
    /* VTIMEZONE custom */
  }
  return iana ? zonedInstant(date, clock, zone) : time.toJSDate().toISOString();
}

function propertyZone(event: ICAL.Event, property: "dtstart" | "dtend") {
  const value = event.component.getFirstProperty(property)?.getParameter("tzid");
  return typeof value === "string" ? value : null;
}

function importedOccurrence(
  source: SourceContent,
  uid: string,
  recurrenceId: string | null,
  item: ICAL.Event,
  start: ICAL.Time,
  end: ICAL.Time,
  accountZone: string,
): ImportedEvent | null {
  if (
    String(item.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED"
  )
    return null;
  let startAt: string;
  let endAt: string;
  try {
    const zone = propertyZone(item, "dtstart");
    startAt = instant(start, accountZone, zone);
    endAt = instant(end, accountZone, propertyZone(item, "dtend") ?? zone);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Cet horaire n’existe pas"))
      return null;
    throw error;
  }
  if (startAt >= endAt) return null;
  const id =
    recurrenceId === null ? `${source.id}:${uid}` : `${source.id}:${uid}:${recurrenceId}`;
  return {
    id,
    occurrenceId: id,
    sourceId: source.id,
    uid,
    recurrenceId,
    sourceName: source.name,
    title: item.summary || "Sans titre",
    startAt,
    endAt,
    allDay: start.isDate,
  };
}

export function resolveImportedOccurrence(
  source: SourceContent,
  uid: string,
  recurrenceId: string | null,
  accountZone: string,
): ImportedEvent | null {
  if (!source.content) return null;
  const components = parseCalendar(source.content).getAllSubcomponents("vevent");
  const master = components.find(
    (item) => !item.hasProperty("recurrence-id") && item.getFirstPropertyValue("uid") === uid,
  );
  if (!master) return null;
  const event = new ICAL.Event(master, { strictExceptions: true });
  if (recurrenceId === null) {
    return event.isRecurring()
      ? null
      : importedOccurrence(
          source,
          uid,
          null,
          event,
          event.startDate,
          event.endDate,
          accountZone,
        );
  }
  if (!event.isRecurring()) return null;
  const exception = components.find(
    (item) =>
      item.hasProperty("recurrence-id") &&
      item.getFirstPropertyValue("uid") === uid &&
      String(item.getFirstPropertyValue("recurrence-id")) === recurrenceId,
  );
  if (exception) {
    const changed = new ICAL.Event(exception);
    return importedOccurrence(
      source,
      uid,
      recurrenceId,
      changed,
      changed.startDate,
      changed.endDate,
      accountZone,
    );
  }
  const iterator = event.iterator();
  let next: ICAL.Time | null;
  let count = 0;
  while ((next = iterator.next())) {
    if (++count > 100000) throw new Error("La récurrence ICS contient trop d’occurrences.");
    const key = next.toString();
    if (key === recurrenceId) {
      const details = event.getOccurrenceDetails(next);
      return importedOccurrence(
        source,
        uid,
        recurrenceId,
        details.item,
        details.startDate,
        details.endDate,
        accountZone,
      );
    }
    if (key > recurrenceId) break;
  }
  return null;
}

export function expandImported(
  source: SourceContent,
  rangeStart: string,
  rangeEnd: string,
  accountZone: string,
): ImportedEvent[] {
  if (!source.content) return [];
  const calendar = parseCalendar(source.content);
  const result = new Map<string, ImportedEvent>();
  const range = { startAt: rangeStart, endAt: rangeEnd };
  const components = calendar.getAllSubcomponents("vevent");
  const masters = components.filter((item) => !item.hasProperty("recurrence-id"));
  const exceptions = new Map(
    components
      .filter((item) => item.hasProperty("recurrence-id"))
      .map((item) => [
        JSON.stringify([
          String(item.getFirstPropertyValue("uid")),
          String(item.getFirstPropertyValue("recurrence-id")),
        ]),
        item,
      ]),
  );

  function add(
    uid: string,
    recurrenceId: string | null,
    item: ICAL.Event,
    start: ICAL.Time,
    end: ICAL.Time,
  ) {
    const occurrence = importedOccurrence(
      source,
      uid,
      recurrenceId,
      item,
      start,
      end,
      accountZone,
    );
    if (occurrence && overlaps(occurrence, range)) result.set(occurrence.id, occurrence);
  }

  for (const component of masters) {
    const event = new ICAL.Event(component, { strictExceptions: true });
    if (!event.isRecurring()) {
      add(event.uid, null, event, event.startDate, event.endDate);
      continue;
    }
    const iterator = event.iterator();
    let count = 0;
    let next: ICAL.Time | null;
    while ((next = iterator.next())) {
      if (++count > 100000) throw new Error("La récurrence ICS contient trop d’occurrences.");
      const details = event.getOccurrenceDetails(next);
      const key = details.recurrenceId.toString();
      const override = exceptions.get(JSON.stringify([event.uid, key]));
      if (override) {
        const changed = new ICAL.Event(override);
        add(event.uid, key, changed, changed.startDate, changed.endDate);
      } else {
        add(event.uid, key, details.item, details.startDate, details.endDate);
      }
      try {
        if (instant(next, accountZone, propertyZone(event, "dtstart")) >= rangeEnd) break;
      } catch (error) {
        if (!(error instanceof Error && error.message.startsWith("Cet horaire n’existe pas")))
          throw error;
      }
    }
  }
  // An overridden occurrence may have moved into the range from a later date.
  for (const component of components.filter((item) => item.hasProperty("recurrence-id"))) {
    const exception = new ICAL.Event(component);
    if (!masters.some((item) => item.getFirstPropertyValue("uid") === exception.uid)) continue;
    add(
      exception.uid,
      exception.recurrenceId.toString(),
      exception,
      exception.startDate,
      exception.endDate,
    );
  }
  return [...result.values()].sort(
    (a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id),
  );
}
