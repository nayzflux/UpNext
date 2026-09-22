import { expect, test } from "@playwright/test";
import { localDate, localTime } from "../../packages/contracts/src/domain";
import { openTaskForm, saveTask, setDateTime, signUp } from "./helpers";

test("la page Aujourd’hui hiérarchise tâches, séances et calendrier", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await signUp(page);

  await openTaskForm(page, "Rendre le dossier aujourd’hui");
  await page.getByLabel("Temps estimé, en minutes").fill("90");
  const today = localDate(new Date(), "Europe/Paris");
  const calendarDay = new Intl.DateTimeFormat("fr-FR").format(new Date(`${today}T12:00:00`));
  await page.locator("#task-date").click();
  await page.locator(`[data-day="${calendarDay}"]`).click();
  await saveTask(page);

  const plannedStart = new Date(
    Math.ceil((Date.now() + 60 * 60000) / (5 * 60000)) * 5 * 60000,
  );
  if (localDate(plannedStart, "Europe/Paris") === today) {
    await page
      .getByRole("button", { name: "Planifier Rendre le dossier aujourd’hui", exact: true })
      .first()
      .click();
    await setDateTime(
      page,
      "Début de la séance",
      `${today}T${localTime(plannedStart, "Europe/Paris")}`,
    );
    await page.getByLabel("Durée, en minutes").fill("30");
    await page.getByRole("button", { name: "Planifier la séance", exact: true }).click();
  }

  const dueMetric = page.locator(".day-intro-stats > div").filter({ hasText: "À rendre" });
  await expect(dueMetric.locator("dd > strong")).toHaveText("1");
  await expect(page.getByRole("heading", { name: /Tâches à faire/ })).toBeVisible();
  await expect(
    page
      .locator(".today-primary-grid > section")
      .first()
      .getByText("Rendre le dossier aujourd’hui"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Séances du jour/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /À planifier/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "La suite aujourd’hui" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "La semaine en un regard" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".today-primary-grid")).toHaveCSS(
    "grid-template-columns",
    "354px",
  );
  await expect(page.locator(".today-week-section .week-overview")).toHaveCSS(
    "overflow-x",
    "auto",
  );
});
