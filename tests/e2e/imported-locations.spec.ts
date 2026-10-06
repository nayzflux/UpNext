import { expect, test } from "@playwright/test";
import { expandImported } from "../../apps/api/src/ical";
import { addCalendarDays, localDate, zonedInstant } from "../../packages/contracts/src/domain";
import { signUp } from "./helpers";

test("les lieux ICS restent accessibles sur les cartes, les événements courts et sur mobile", async ({
  page,
}) => {
  await signUp(page);
  const today = localDate(new Date(), "Europe/Paris");
  const tomorrow = addCalendarDays(today, 1);
  const stamp = (value: string) => value.replace(/[-:]/g, "").slice(0, 15) + "Z";
  const source = {
    id: crypto.randomUUID(),
    name: "Calendrier de test",
    url: "https://example.org/audit.ics",
    attemptedAt: new Date().toISOString(),
    succeededAt: new Date().toISOString(),
    error: null,
  };
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UpNext audit//EN",
    "BEGIN:VEVENT",
    "UID:campus",
    "DTSTAMP:20260101T000000Z",
    "SUMMARY:Journée au campus",
    "LOCATION:Campus\\, bâtiment A",
    `DTSTART;VALUE=DATE:${today.replace(/-/g, "")}`,
    `DTEND;VALUE=DATE:${tomorrow.replace(/-/g, "")}`,
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:course",
    "DTSTAMP:20260101T000000Z",
    "SUMMARY:Cours importé",
    "LOCATION:Salle B",
    `DTSTART:${stamp(zonedInstant(tomorrow, "10:00", "Europe/Paris"))}`,
    `DTEND:${stamp(zonedInstant(tomorrow, "12:00", "Europe/Paris"))}`,
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:short",
    "DTSTAMP:20260101T000000Z",
    "SUMMARY:Rendez-vous court",
    "LOCATION:Salle C",
    `DTSTART:${stamp(zonedInstant(tomorrow, "14:00", "Europe/Paris"))}`,
    `DTEND:${stamp(zonedInstant(tomorrow, "14:15", "Europe/Paris"))}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const events = expandImported(
    { ...source, content },
    zonedInstant(today, "00:00", "Europe/Paris"),
    zonedInstant(addCalendarDays(tomorrow, 1), "00:00", "Europe/Paris"),
    "Europe/Paris",
  );
  // Use a parsed ICS fixture so this UI check never contacts an external calendar.
  await page.route("**/api/rpc/calendarSources/create", (route) =>
    route.fulfill({ json: { json: source } }),
  );
  await page.route("**/api/rpc/calendarSources/syncDue", (route) =>
    route.fulfill({ json: { json: [source] } }),
  );
  await page.route("**/api/rpc/dashboard/get", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.json.calendarSources = [source];
    await route.fulfill({ response, json: payload });
  });
  await page.route("**/api/rpc/importedEvents/list**", (route) =>
    route.fulfill({ json: { json: events } }),
  );
  await page.goto("/parametres");
  await page.getByLabel("Nom du calendrier", { exact: true }).fill(source.name);
  await page.getByLabel("Lien ICS HTTPS", { exact: true }).fill(source.url);
  await page.getByRole("button", { name: "Ajouter un calendrier", exact: true }).click();
  await expect(page.getByText("Calendrier ajouté", { exact: true })).toBeVisible();
  await page
    .locator(".sidebar-nav")
    .getByRole("link", { name: "Calendrier", exact: true })
    .click();
  await page.getByRole("button", { name: "Jour", exact: true }).click();
  await page.getByRole("button", { name: "Période suivante", exact: true }).click();
  const course = page.locator(".calendar-block").filter({ hasText: "Cours importé" });
  await expect(course).toContainText("Salle B");
  await course.click();
  const modal = page.getByTestId("editor-modal");
  await expect(modal).toContainText("Lieu : Salle B");
  await page.keyboard.press("Escape");
  await page.locator(".calendar-block").filter({ hasText: "Rendez-vous court" }).click();
  await expect(modal).toContainText("Lieu : Salle C");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(course).toContainText("Salle B");
  await course.click();
  await expect(modal).toContainText("Lieu : Salle B");
  await page.keyboard.press("Escape");
  const todayLink = page
    .locator(".mobile-bottom-nav")
    .getByRole("link", { name: "Aujourd’hui", exact: true });
  await todayLink.focus();
  await todayLink.press("Enter");
  await expect(page.locator(".today-all-day")).toContainText("Campus, bâtiment A");
  await page.locator(".today-all-day-event").click();
  await expect(modal).toContainText("Lieu : Campus, bâtiment A");
});
