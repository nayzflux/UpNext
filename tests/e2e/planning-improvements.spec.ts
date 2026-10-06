import { expect, test } from "@playwright/test";
import { addCalendarDays, localDate } from "../../packages/contracts/src/domain";
import { openTaskForm, setDateTime, signUp } from "./helpers";

test("une tâche sans estimation se planifie par pourcentage et disparaît une fois couverte", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/taches");
  await openTaskForm(page, "Travail sans estimation");
  const tomorrow = addCalendarDays(localDate(new Date(), "Europe/Paris"), 1);
  const deadline = addCalendarDays(tomorrow, 6);
  await page.locator("#task-date").click();
  const day = new Intl.DateTimeFormat("fr-FR").format(new Date(`${deadline}T12:00:00`));
  await page.locator(`[data-day="${day}"]`).click();
  await page.getByRole("button", { name: "Créer la tâche", exact: true }).click();
  const modal = page.getByTestId("editor-modal");
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".desktop-task-table")).toContainText("Non estimée");

  await page.goto(`/calendrier?date=${tomorrow}`);
  await page.getByRole("button", { name: "Jour", exact: true }).click();
  await expect(page.locator(".calendar-backlog")).toContainText("Travail sans estimation");
  await page
    .getByRole("button", { name: "Planifier Travail sans estimation", exact: true })
    .click();
  await expect(page.getByLabel("Durée, en minutes")).toHaveValue("30");
  await setDateTime(page, "Début de la séance", `${tomorrow}T10:00`);
  await page.getByLabel("Durée, en minutes").fill("45");
  await expect(page.getByLabel("Part de la tâche, en %")).toHaveAttribute("required", "");
  await page.getByLabel("Part de la tâche, en %").fill("100");
  await page.getByRole("button", { name: "Planifier la séance", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".calendar-backlog")).not.toContainText("Travail sans estimation");

  await page.goto("/taches");
  await expect(
    page.getByRole("button", { name: "Planifier Travail sans estimation", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".desktop-task-table")
    .getByRole("button", { name: "Travail sans estimation", exact: true })
    .click();
  await expect(modal.getByRole("button", { name: "Planifier", exact: true })).toHaveCount(0);
  await expect(
    modal.getByRole("button", { name: "Modifier la séance", exact: true }),
  ).toBeVisible();
  await modal.getByRole("button", { name: "Modifier", exact: true }).click();
  await expect(page.getByLabel("Temps estimé, en minutes")).toHaveValue("");
  await page.getByLabel("Temps estimé, en minutes").fill("120");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Planifier Travail sans estimation", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-task-list")).toContainText("Planifiée");
  await expect(
    page.getByRole("button", { name: "Planifier Travail sans estimation", exact: true }),
  ).toHaveCount(0);
});
