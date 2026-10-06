import { expect, test } from "@playwright/test";
import { addCalendarDays, localDate } from "../../packages/contracts/src/domain";
import { openTaskForm, saveTask, setDateTime, signUp } from "./helpers";

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

test("le calendrier précède la liste et garde la création accessible dans chaque vue", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/calendrier");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const layout = page.locator(".calendar-layout");
  const surface = page.locator(".calendar-surface");
  const backlog = page.locator(".calendar-backlog");
  await expect(layout.locator(":scope > *").first()).toHaveClass("calendar-surface");
  expect((await surface.boundingBox())!.x).toBeLessThan((await backlog.boundingBox())!.x);
  await expect(
    backlog.getByRole("button", { name: "Nouvelle tâche", exact: true }),
  ).toHaveCount(0);
  for (const view of ["Jour", "Semaine", "Mois"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await page
      .locator(".page-heading")
      .getByRole("button", { name: "Nouvelle tâche", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Une nouvelle tâche" })).toBeVisible();
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
  }
  await page.getByRole("button", { name: "Événements", exact: true }).click();
  await expect(backlog).toHaveCount(0);
  await page
    .locator(".page-heading")
    .getByRole("button", { name: "Nouvelle tâche", exact: true })
    .click();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.getByRole("button", { name: "Tout", exact: true }).click();
  await page.getByRole("button", { name: "Jour", exact: true }).click();
  await page.screenshot({ path: "test-results/calendar-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => (await backlog.boundingBox())!.y - (await surface.boundingBox())!.y)
    .toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/calendar-mobile.png", fullPage: true });
});

test("le bilan d'une séance future est prérempli, enregistrable et réestimable", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/taches");
  await openTaskForm(page, "Séance effectuée en avance");
  await saveTask(page);
  await page
    .getByRole("button", { name: "Faire le bilan de Séance effectuée en avance" })
    .click();
  await expect(page.getByLabel("Temps réellement passé, en minutes")).toHaveValue("30");
  await expect(page.getByLabel("Avancement total de la tâche, en %")).toHaveValue("50");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  const tomorrow = addCalendarDays(localDate(new Date(), "Europe/Paris"), 1);
  await page.getByRole("button", { name: "Planifier Séance effectuée en avance" }).click();
  await setDateTime(page, "Début de la séance", `${tomorrow}T11:00`);
  await page.getByLabel("Durée, en minutes").fill("30");
  await page.getByRole("button", { name: "Planifier la séance", exact: true }).click();
  const modal = page.getByTestId("editor-modal");
  await expect(modal).toHaveCount(0);
  await page
    .getByRole("button", { name: "Faire le bilan de Séance effectuée en avance" })
    .click();
  await expect(page.getByText("Ce bilan concerne-t-il une séance prévue ?")).toBeVisible();
  await modal.getByRole("button", { name: /· 30 min/ }).click();
  await expect(page.getByLabel("Temps réellement passé, en minutes")).toHaveValue("30");
  await expect(page.getByLabel("Avancement total de la tâche, en %")).toHaveValue("50");
  await expect(page.getByLabel("Je n’ai pas pu faire cette séance")).toHaveCount(0);
  await page.getByLabel("Temps réellement passé, en minutes").fill("45");
  await page.getByRole("button", { name: "Enregistrer le bilan" }).click();
  await expect(modal.getByRole("heading", { name: "Ajuster le temps prévu ?" })).toBeVisible();
  await page.getByRole("button", { name: "Garder mon estimation" }).click();
  await expect(modal).toHaveCount(0);
  await page
    .locator(".desktop-task-table")
    .getByRole("button", { name: "Séance effectuée en avance", exact: true })
    .click();
  await expect(modal).toContainText("Effectuée");
  await expect(modal).toContainText("45 min travaillées");
  await modal.getByRole("button", { name: "Corriger", exact: true }).click();
  await expect(page.getByLabel("Temps réellement passé, en minutes")).toHaveValue("45");
  await expect(page.getByLabel("Avancement total de la tâche, en %")).toHaveValue("50");
});
