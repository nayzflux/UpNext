import { describe, expect, it } from "vitest";
import { expandImported, parseCalendar, resolveImportedOccurrence } from "./ical";

const source = (content: string) => ({
  id: "4c838bd6-3e88-4254-b27f-ea494d8bc7ee",
  name: "Université",
  content: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//UpNext tests//EN\r\n${content}END:VCALENDAR\r\n`,
});
const event = (body: string) => `BEGIN:VEVENT\r\nDTSTAMP:20260101T000000Z\r\n${body}END:VEVENT\r\n`;

describe("import ICS", () => {
  it("garde l’UID d’un événement ponctuel déplacé et retrouve sa nouvelle heure", () => {
    const first = source(event("UID:exam\r\nSUMMARY:Examen\r\nDTSTART:20261001T080000Z\r\nDTEND:20261001T100000Z\r\n"));
    const moved = source(event("UID:exam\r\nSUMMARY:Examen\r\nDTSTART:20261002T110000Z\r\nDTEND:20261002T130000Z\r\n"));
    const initial = expandImported(first, "2026-10-01T00:00:00Z", "2026-10-03T00:00:00Z", "Europe/Paris")[0];
    const updated = expandImported(moved, "2026-10-01T00:00:00Z", "2026-10-03T00:00:00Z", "Europe/Paris")[0];
    expect(initial.id).toBe(updated.id);
    expect(updated).toMatchObject({ uid: "exam", recurrenceId: null });
    expect(resolveImportedOccurrence(moved, "exam", null, "Europe/Paris")?.startAt)
      .toBe("2026-10-02T11:00:00.000Z");
  });

  it("suit une exception récurrente déplacée sans afficher son ancien créneau", () => {
    const calendar = source(
      event("UID:course\r\nSUMMARY:Cours\r\nDTSTART:20261001T080000Z\r\nDTEND:20261001T090000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\n") +
      event("UID:course\r\nRECURRENCE-ID:20261002T080000Z\r\nSUMMARY:Cours déplacé\r\nDTSTART:20261005T110000Z\r\nDTEND:20261005T120000Z\r\n"),
    );
    const originalDay = expandImported(calendar, "2026-10-02T00:00:00Z", "2026-10-03T00:00:00Z", "Europe/Paris");
    expect(originalDay).toEqual([]);
    const moved = resolveImportedOccurrence(calendar, "course", "2026-10-02T08:00:00Z", "Europe/Paris");
    expect(moved?.startAt).toBe("2026-10-05T11:00:00.000Z");
  });
  it("lit les événements ponctuels et les journées entières sur plusieurs jours", () => {
    const calendar = source(
      event("UID:one\r\nSUMMARY:Examen\r\nDTSTART:20261001T080000Z\r\nDTEND:20261001T100000Z\r\n") +
      event("UID:two\r\nSUMMARY:Festival\r\nDTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261003\r\n"),
    );
    const events = expandImported(calendar, "2026-10-01T00:00:00Z", "2026-10-04T00:00:00Z", "Europe/Paris");
    expect(events).toHaveLength(2);
    expect(events.find((item) => item.title === "Festival")).toMatchObject({
      allDay: true, startAt: "2026-09-30T22:00:00.000Z", endAt: "2026-10-02T22:00:00.000Z",
    });
  });

  it("applique récurrences, exception déplacée, annulation et changement d’heure", () => {
    const calendar = source(
      event("UID:course\r\nSUMMARY:Cours\r\nDTSTART;TZID=Europe/Paris:20260322T090000\r\nDTEND;TZID=Europe/Paris:20260322T100000\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\n") +
      event("UID:course\r\nRECURRENCE-ID;TZID=Europe/Paris:20260329T090000\r\nSUMMARY:Cours déplacé\r\nDTSTART;TZID=Europe/Paris:20260330T110000\r\nDTEND;TZID=Europe/Paris:20260330T120000\r\n") +
      event("UID:course\r\nRECURRENCE-ID;TZID=Europe/Paris:20260405T090000\r\nSTATUS:CANCELLED\r\nSUMMARY:Cours\r\nDTSTART;TZID=Europe/Paris:20260405T090000\r\nDTEND;TZID=Europe/Paris:20260405T100000\r\n"),
    );
    const events = expandImported(calendar, "2026-03-21T00:00:00Z", "2026-04-14T00:00:00Z", "Europe/Paris");
    expect(events.map((item) => item.title)).toEqual(["Cours", "Cours déplacé", "Cours"]);
    expect(events.map((item) => item.startAt)).toEqual([
      "2026-03-22T08:00:00.000Z", "2026-03-30T09:00:00.000Z", "2026-04-12T07:00:00.000Z",
    ]);
  });

  it("respecte EXDATE et RDATE et retrouve une exception avancée dans la période", () => {
    const calendar = source(
      event("UID:series\r\nSUMMARY:Atelier\r\nDTSTART:20261101T090000Z\r\nDTEND:20261101T100000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20261102T090000Z\r\nRDATE:20261105T090000Z\r\n") +
      event("UID:series\r\nRECURRENCE-ID:20261103T090000Z\r\nSUMMARY:Atelier avancé\r\nDTSTART:20261030T090000Z\r\nDTEND:20261030T100000Z\r\n"),
    );
    const october = expandImported(calendar, "2026-10-30T00:00:00Z", "2026-10-31T00:00:00Z", "Europe/Paris");
    expect(october.map((item) => item.title)).toEqual(["Atelier avancé"]);
    const november = expandImported(calendar, "2026-11-01T00:00:00Z", "2026-11-07T00:00:00Z", "Europe/Paris");
    expect(november.map((item) => item.startAt)).toEqual([
      "2026-11-01T09:00:00.000Z", "2026-11-05T09:00:00.000Z",
    ]);
  });

  it("respecte un fuseau VTIMEZONE fourni par le flux", () => {
    const timezone = "BEGIN:VTIMEZONE\r\nTZID:X-CAMPUS\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0530\r\nTZOFFSETTO:+0530\r\nTZNAME:X-CAMPUS\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n";
    const calendar = source(timezone + event("UID:campus\r\nSUMMARY:Cours\r\nDTSTART;TZID=X-CAMPUS:20260922T100000\r\nDTEND;TZID=X-CAMPUS:20260922T110000\r\n"));
    const events = expandImported(calendar, "2026-09-22T00:00:00Z", "2026-09-23T00:00:00Z", "Europe/Paris");
    expect(events[0].startAt).toBe("2026-09-22T04:30:00.000Z");
  });

  it("n’invente pas l’heure inexistante du passage à l’heure d’été", () => {
    const calendar = source(event("UID:night\r\nSUMMARY:Nocturne\r\nDTSTART;TZID=Europe/Paris:20260322T023000\r\nDTEND;TZID=Europe/Paris:20260322T033000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\n"));
    const events = expandImported(calendar, "2026-03-21T00:00:00Z", "2026-04-06T00:00:00Z", "Europe/Paris");
    expect(events.map((item) => item.startAt)).toEqual([
      "2026-03-22T01:30:00.000Z", "2026-04-05T00:30:00.000Z",
    ]);
  });

  it("interprète un TZID IANA même sans VTIMEZONE et indépendamment du fuseau du compte", () => {
    const calendar = source(event("UID:ny\r\nSUMMARY:New York\r\nDTSTART;TZID=America/New_York:20260922T090000\r\nDTEND;TZID=America/New_York:20260922T100000\r\n"));
    const events = expandImported(calendar, "2026-09-22T00:00:00Z", "2026-09-23T00:00:00Z", "Europe/Paris");
    expect(events[0].startAt).toBe("2026-09-22T13:00:00.000Z");
  });

  it("refuse un contenu qui n’est pas un calendrier", () => {
    expect(() => parseCalendar("Bonjour")).toThrow();
    expect(() => parseCalendar("<br />\nWarning: PHP\nBEGIN:VCALENDAR\nEND:VCALENDAR"))
      .toThrow("Le serveur du calendrier a renvoyé du HTML au lieu d’un flux ICS valide.");
    expect(() => parseCalendar(source(event("UID:html-text\r\nSUMMARY:Note\r\nDESCRIPTION:<br />\r\nDTSTART:20261001T080000Z\r\nDTEND:20261001T090000Z\r\n")).content)).not.toThrow();
  });
});
