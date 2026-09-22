import ICAL from "ical.js";
import { overlaps, zonedInstant, type ImportedEvent } from "@upnext/contracts";

type SourceContent = { id: string; name: string; content: string | null };

export function parseCalendar(content: string) {
  if (/(?:^|\r?\n)\s*<(?:br\b|html\b|!doctype\s+html\b)/i.test(content)) {
    throw new Error("Le serveur du calendrier a renvoyé du HTML au lieu d’un flux ICS valide.");
  }
  const component = new ICAL.Component(ICAL.parse(content));
  if (component.name !== "vcalendar") throw new Error("Le flux ne contient pas de calendrier ICS.");
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
  if (time.isDate || !zone || zone === "floating") return zonedInstant(date, time.isDate ? "00:00" : clock, accountZone);
  if (zone === "UTC" || zone === "Z") return time.toJSDate().toISOString();
  let iana = false;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); iana = true; } catch { /* VTIMEZONE custom */ }
  return iana ? zonedInstant(date, clock, zone) : time.toJSDate().toISOString();
}

function propertyZone(event: ICAL.Event, property: "dtstart" | "dtend") {
  const value = event.component.getFirstProperty(property)?.getParameter("tzid");
  return typeof value === "string" ? value : null;
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

  function add(uid: string, recurrenceId: string, item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) {
    if (String(item.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") return;
    let startAt: string;
    let endAt: string;
    try {
      const zone = propertyZone(item, "dtstart");
      startAt = instant(start, accountZone, zone);
      endAt = instant(end, accountZone, propertyZone(item, "dtend") ?? zone);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Cet horaire n’existe pas")) return;
      throw error;
    }
    if (startAt >= endAt || !overlaps({ startAt, endAt }, range)) return;
    const id = `${source.id}:${uid}:${recurrenceId}`;
    result.set(id, {
      id,
      occurrenceId: id,
      sourceId: source.id,
      sourceName: source.name,
      title: item.summary || "Sans titre",
      startAt,
      endAt,
      allDay: start.isDate,
    });
  }

  for (const component of masters) {
    const event = new ICAL.Event(component, { strictExceptions: true });
    if (!event.isRecurring()) {
      add(event.uid, event.startDate.toString(), event, event.startDate, event.endDate);
      continue;
    }
    const iterator = event.iterator();
    let count = 0;
    let next: ICAL.Time | null;
    while ((next = iterator.next())) {
      if (++count > 100000) throw new Error("La récurrence ICS contient trop d’occurrences.");
      const details = event.getOccurrenceDetails(next);
      add(event.uid, details.recurrenceId.toString(), details.item, details.startDate, details.endDate);
      try {
        if (instant(next, accountZone, propertyZone(event, "dtstart")) >= rangeEnd) break;
      } catch (error) {
        if (!(error instanceof Error && error.message.startsWith("Cet horaire n’existe pas"))) throw error;
      }
    }
  }
  // An overridden occurrence may have moved into the range from a later date.
  for (const component of components.filter((item) => item.hasProperty("recurrence-id"))) {
    const exception = new ICAL.Event(component);
    if (!masters.some((item) => item.getFirstPropertyValue("uid") === exception.uid)) continue;
    add(exception.uid, exception.recurrenceId.toString(), exception, exception.startDate, exception.endDate);
  }
  return [...result.values()].sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
}
