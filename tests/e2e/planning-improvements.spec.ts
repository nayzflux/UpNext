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

test("le profil regroupe le compte et protège les préférences avant déconnexion sur PC et mobile", async ({
  page,
}) => {
  const email = await signUp(page);
  const sidebar = page.locator(".app-sidebar");
  await expect(
    sidebar.getByRole("button", { name: "Nouvelle tâche", exact: true }),
  ).toHaveCount(0);
  await expect(sidebar.locator(".sidebar-tags, .sidebar-note")).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Ouvrir le menu du compte", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toContainText(email);
  await page.getByRole("menuitem", { name: "Mon compte", exact: true }).click();
  await expect(page).toHaveURL(/\/parametres#compte$/);
  await expect(page.locator("#compte")).toContainText(email);
  await trigger.click();
  await page.screenshot({ path: "test-results/account-desktop.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole("combobox", { name: "Fuseau horaire", exact: true }).click();
  await page.getByRole("option", { name: "UTC", exact: true }).click();
  await trigger.click();
  await page.getByRole("menuitem", { name: "Se déconnecter", exact: true }).click();
  const warning = page.getByRole("alertdialog", { name: "Abandonner les modifications ?" });
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "Continuer à modifier" }).click();
  await expect(
    page.getByRole("combobox", { name: "Fuseau horaire", exact: true }),
  ).toContainText("UTC");
  await page.getByRole("button", { name: "Enregistrer mes préférences", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const account = page
    .locator(".mobile-bottom-nav")
    .getByRole("button", { name: "Compte", exact: true });
  await account.click();
  const sheet = page.getByRole("dialog", { name: "Compte", exact: true });
  await expect(sheet).toContainText(email);
  await page.screenshot({ path: "test-results/account-mobile.png", fullPage: true });
  await sheet.getByRole("button", { name: "Paramètres", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/parametres$/);
  await account.click();
  await sheet.getByRole("button", { name: "Se déconnecter", exact: true }).click();
  await expect(page).toHaveURL(/\/connexion$/);
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
