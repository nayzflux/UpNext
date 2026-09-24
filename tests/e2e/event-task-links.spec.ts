import { expect, test } from "@playwright/test";
import { addCalendarDays, localDate } from "../../packages/contracts/src/domain";
import { signUp, setDateTime } from "./helpers";

test("crée une tâche depuis un événement et l’affiche sur son occurrence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await signUp(page);
  const date = addCalendarDays(localDate(new Date(), "Europe/Paris"), 3);
  await page.goto(`/calendrier?date=${date}`);
  await page.getByRole("button", { name: "Jour", exact: true }).click();
  await page.getByRole("button", { name: "Événement", exact: true }).click();
  await page.getByLabel("Nom de l’événement").fill("Présentation");
  await setDateTime(page, "Début", `${date}T14:00`);
  await setDateTime(page, "Fin", `${date}T15:00`);
  await page.getByRole("button", { name: "Créer l’événement", exact: true }).click();

  await page.locator(".event-block").filter({ hasText: "Présentation" }).click();
  await expect(page.getByRole("heading", { name: "Tâches associées (0)" })).toBeVisible();
  await page.getByRole("button", { name: "Ajouter une tâche" }).click();
  await page.getByLabel("Qu’as-tu à faire ?").fill("Préparer les slides");
  await page.getByLabel("Temps estimé, en minutes").fill("60");
  await expect(page.locator("#task-date")).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Heure de la date limite" })).toBeDisabled();
  await page.getByRole("button", { name: "Créer la tâche", exact: true }).click();
  await expect(page.getByTestId("editor-modal")).toHaveCount(0);

  const event = page.locator(".event-block").filter({ hasText: "Présentation" });
  await expect(event).toContainText("1 tâche associée");
  await event.click();
  await expect(page.getByRole("heading", { name: "Tâches associées (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Préparer les slides" }).click();
  await expect(page.getByText("À terminer le")).toBeVisible();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.getByRole("combobox", { name: "Événement associé" }).click();
  await page.getByRole("option", { name: "Aucun événement associé" }).click();
  await expect(page.locator("#task-date")).toBeEnabled();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(event).not.toContainText("tâche associée");
});
