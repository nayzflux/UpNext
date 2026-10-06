import { expect, test } from "@playwright/test";
import { addCalendarDays, localDate } from "../../packages/contracts/src/domain";
import { addTag, openTaskForm, saveTask, setDateTime, signUp } from "./helpers";

test("la recherche combine titre, description et tags sur ordinateur et mobile", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/taches");

  await openTaskForm(page, "Préparer le dossier");
  await page
    .getByLabel("Quelques détails · facultatif")
    .fill("Relire les annexes avant lundi");
  await addTag(page, "Études");
  await saveTask(page);

  await openTaskForm(page, "Préparer la réunion");
  await saveTask(page);

  const search = page.getByRole("textbox", { name: "Rechercher une tâche" });
  await search.fill("etudes ANNEXES preparer");
  await expect(
    page.locator(".desktop-task-table").getByRole("row", { name: /Préparer le dossier/ }),
  ).toBeVisible();
  await expect(
    page.locator(".desktop-task-table").getByRole("row", { name: /Préparer la réunion/ }),
  ).toHaveCount(0);

  await page.getByRole("combobox", { name: "Filtrer par tag" }).click();
  await page.getByRole("option", { name: "Études", exact: true }).click();
  await expect(
    page.locator(".desktop-task-table").getByRole("row", { name: /Préparer le dossier/ }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page
      .locator(".mobile-task-list")
      .getByRole("button", { name: "Préparer le dossier", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".mobile-task-list")
      .getByRole("button", { name: "Préparer la réunion", exact: true }),
  ).toHaveCount(0);
});

test("un bilan choisit une séance passée ou future, ou reste sans réservation", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/taches");
  await openTaskForm(page, "Terminer mon dossier");
  await saveTask(page);

  await page.getByRole("button", { name: "Faire le bilan de Terminer mon dossier" }).click();
  await expect(page.getByLabel("Temps réellement passé, en minutes")).toBeVisible();
  await expect(page.getByText("Ce bilan concerne-t-il une séance prévue ?")).toHaveCount(0);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();

  const past = addCalendarDays(localDate(new Date(), "Europe/Paris"), -2);
  const future = addCalendarDays(localDate(new Date(), "Europe/Paris"), 1);
  await page.getByRole("button", { name: "Planifier Terminer mon dossier" }).click();
  await setDateTime(page, "Début de la séance", `${future}T11:00`);
  await page.getByLabel("Durée, en minutes").fill("30");
  await page.getByRole("button", { name: "Planifier la séance", exact: true }).click();

  await page.getByRole("button", { name: "Faire le bilan de Terminer mon dossier" }).click();
  await expect(page.getByText("Ce bilan concerne-t-il une séance prévue ?")).toBeVisible();
  await page.getByRole("button", { name: "Continuer sans réservation" }).click();
  await expect(page.getByLabel("Temps réellement passé, en minutes")).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();

  await page.getByRole("button", { name: "Planifier Terminer mon dossier" }).click();
  await setDateTime(page, "Début de la séance", `${past}T10:00`);
  await page.getByLabel("Durée, en minutes").fill("60");
  await page.getByRole("button", { name: "Planifier la séance", exact: true }).click();

  await page.getByRole("button", { name: "Terminer mon dossier", exact: true }).click();
  await page.getByRole("button", { name: "Faire un bilan", exact: true }).click();
  await expect(page.getByText("Ce bilan concerne-t-il une séance prévue ?")).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();

  await page.getByRole("button", { name: "Faire le bilan de Terminer mon dossier" }).click();
  await expect(page.getByText("Ce bilan concerne-t-il une séance prévue ?")).toBeVisible();
  const choices = page.getByTestId("editor-modal").getByRole("button", { name: /· 1 h/ });
  await expect(choices).toHaveCount(1);
  await expect(
    page.getByTestId("editor-modal").getByRole("button", { name: /· 30 min/ }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Continuer sans réservation" }).click();
  await expect(page.getByText("Travail réalisé sans réservation")).toBeVisible();
  await page.getByRole("button", { name: "Changer de choix" }).click();
  await choices.click();
  await expect(page.getByText("1 h prévues pour cette séance")).toBeVisible();
  await page.getByLabel("Temps réellement passé, en minutes").fill("60");
  await page.getByLabel("Avancement total de la tâche, en %").fill("100");
  await page.getByRole("button", { name: "Enregistrer le bilan" }).click();
  await expect(page.getByTestId("editor-modal")).toHaveCount(0);

  await page.getByRole("button", { name: "Terminées", exact: true }).click();
  await page.getByRole("button", { name: "Terminer mon dossier", exact: true }).click();
  await expect(page.getByText("Effectuée")).toBeVisible();
  await expect(page.getByText("Annulée")).toHaveCount(0);
  await expect(page.getByText("11:00")).toHaveCount(0);
});
