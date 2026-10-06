import { expect, test } from "@playwright/test";
import { addCalendarDays, localDate } from "../../packages/contracts/src/domain";
import { openTaskForm, saveTask, setDateTime, signUp } from "./helpers";

test("le parcours tactile préserve les saisies et permet de planifier et faire un bilan", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    // WebKit can defer a popup's resize notification to the next frame.
    // This browser diagnostic is separate from uncaught application errors.
    if (error.message !== "ResizeObserver loop completed with undelivered notifications.") {
      errors.push(error.message);
    }
  });
  await signUp(page);
  await page.getByRole("button", { name: "Ouvrir le menu" }).tap();
  const menu = page.getByRole("dialog", { name: "Navigation principale" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Fermer le menu" }).tap();
  await expect(menu).toHaveCount(0);

  await page.locator(".mobile-bottom-nav").getByRole("link", { name: "Mes tâches" }).tap();
  await openTaskForm(page, "Préparer le dossier mobile");
  await page
    .getByLabel("Quelques détails · facultatif")
    .fill("Conserver cette note après une fermeture ou une erreur.");
  await page.getByRole("button", { name: "Fermer", exact: true }).tap();
  const warning = page.getByRole("alertdialog", { name: "Abandonner les modifications ?" });
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "Continuer à modifier" }).tap();
  await expect(page.getByLabel("Quelques détails · facultatif")).toHaveValue(
    "Conserver cette note après une fermeture ou une erreur.",
  );

  await context.setOffline(true);
  await page.getByLabel("Temps estimé, en minutes").fill("60");
  const dueDate = addCalendarDays(localDate(new Date(), "Europe/Paris"), 7);
  await page.locator("#task-date").tap();
  await page
    .locator(
      `[data-day="${new Intl.DateTimeFormat("fr-FR").format(new Date(`${dueDate}T12:00:00`))}"]`,
    )
    .tap();
  await page.getByRole("button", { name: "Créer la tâche", exact: true }).tap();
  await expect(page.getByTestId("editor-modal")).toBeVisible();
  await expect(page.getByLabel("Qu’as-tu à faire ?")).toHaveValue(
    "Préparer le dossier mobile",
  );
  await context.setOffline(false);
  await saveTask(page);

  await page
    .getByRole("button", { name: "Planifier Préparer le dossier mobile", exact: true })
    .tap();
  const tomorrow = addCalendarDays(localDate(new Date(), "Europe/Paris"), 1);
  await setDateTime(page, "Début de la séance", `${tomorrow}T10:00`);
  await page.getByLabel("Durée, en minutes").fill("30");
  await page.getByRole("button", { name: "Planifier la séance", exact: true }).tap();
  await expect(page.getByTestId("editor-modal")).toHaveCount(0);
  const navigation = page.locator(".mobile-bottom-nav");
  await navigation.getByRole("link", { name: "Calendrier", exact: true }).tap();
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).tap();
  await page.getByRole("button", { name: "Période suivante" }).tap();
  const card = page.getByTestId("session-card");
  await expect(card).toContainText("Préparer le dossier mobile");
  await card.getByRole("button").first().tap();
  await expect(page.getByRole("heading", { name: "Modifier la séance" })).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).tap();

  await navigation.getByRole("link", { name: "Mes tâches", exact: true }).tap();
  await page
    .getByRole("button", { name: "Faire le bilan de Préparer le dossier mobile", exact: true })
    .tap();
  await page.getByRole("button", { name: "Continuer sans réservation", exact: true }).tap();
  await page.getByLabel("Temps réellement passé, en minutes").fill("60");
  await page.getByLabel("Avancement total de la tâche, en %").fill("100");
  await page.getByRole("button", { name: "Enregistrer le bilan" }).tap();
  await expect(page.getByTestId("editor-modal")).toHaveCount(0);
  await page.getByRole("button", { name: "Terminées", exact: true }).tap();
  await expect(page.locator(".mobile-task-list")).toContainText("Préparer le dossier mobile");
  await navigation.getByRole("link", { name: "Calendrier", exact: true }).tap();
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).tap();
  await page.getByRole("button", { name: "Période suivante" }).tap();
  await expect(page.getByTestId("session-card")).toHaveCount(0);
  await navigation.getByRole("link", { name: "Paramètres", exact: true }).tap();
  await page.getByRole("combobox", { name: "Fuseau horaire" }).tap();
  await page.getByRole("option", { name: "UTC", exact: true }).tap();
  await navigation.getByRole("link", { name: "Mes tâches", exact: true }).tap();
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "Continuer à modifier" }).tap();
  await expect(page.getByRole("combobox", { name: "Fuseau horaire" })).toContainText("UTC");
  await navigation.getByRole("link", { name: "Mes tâches", exact: true }).tap();
  await warning.getByRole("button", { name: "Abandonner", exact: true }).tap();
  await expect(page).toHaveURL(/\/taches$/);
  expect(errors).toEqual([]);
});
