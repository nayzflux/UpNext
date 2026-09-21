import { expect, test } from "@playwright/test";
import { addCalendarDays, localDate } from "../../packages/contracts/src/domain";
import { hourHeight } from "../../apps/web/src/lib/calendar-layout";
import { signUp, openTaskForm, saveTask, addTag } from "./helpers";

const today = () => localDate(new Date(), "Europe/Paris");
test("inscription, tags, 50 %, déplacement, refus, bilan et réévaluation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signUp(page);
  await expect(page.getByText("Ils prennent forme avec tes tâches.")).toBeVisible();
  await openTaskForm(page, "Préparer mon DS");
  await page.getByLabel("Temps estimé, en minutes").fill("240");
  await addTag(page, "Révisions");
  await addTag(page, "Priorités");
  await saveTask(page);
  await page.goto("/taches");
  await expect(page.getByRole("row", { name: /Préparer mon DS/ })).toContainText("Révisions");
  await expect(page.getByRole("row", { name: /Préparer mon DS/ })).toContainText("Priorités");
  await page.getByRole("button", { name: "Planifier Préparer mon DS", exact: true }).click();
  const tomorrow = addCalendarDays(today(), 1);
  await page.getByLabel("Début de la séance").fill(`${tomorrow}T10:00`);
  await page.getByLabel("Part de la tâche, en %").fill("50");
  await expect(page.getByLabel("Durée, en minutes")).toHaveValue("120");
  await page.getByRole("button", { name: "Planifier la séance", exact: true }).click();
  await expect(page.getByTestId("editor-modal")).toHaveCount(0);

  await page.goto(`/calendrier?date=${tomorrow}`);
  await page.getByRole("button", { name: "Jour", exact: true }).click();
  const block = page.getByRole("button", {
    name: "Préparer mon DS, 10:00. Déplacer ou ouvrir la séance.",
    exact: true,
  });
  await expect(block).toBeVisible();
  const box = await block.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 40, box!.y + 20);
  await page.mouse.down();
  await page.mouse.move(box!.x + 40, box!.y + 20 + hourHeight, { steps: 12 });
  await page.mouse.up();
  await expect(
    page.getByRole("button", {
      name: "Préparer mon DS, 11:00. Déplacer ou ouvrir la séance.",
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Événement", exact: true }).click();
  await page.getByLabel("Nom de l’événement").fill("Rendez-vous");
  await page.getByLabel("Début", { exact: true }).fill(`${tomorrow}T13:00`);
  await page.getByLabel("Fin", { exact: true }).fill(`${tomorrow}T14:00`);
  await page.getByRole("button", { name: "Créer l’événement", exact: true }).click();
  await expect(page.getByTestId("editor-modal")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Rendez-vous 13:00–14:00 · 1 h", exact: true }),
  ).toHaveCount(1);
  const moved = page.getByRole("button", {
    name: "Préparer mon DS, 11:00. Déplacer ou ouvrir la séance.",
    exact: true,
  });
  const movedBox = await moved.boundingBox();
  await page.mouse.move(movedBox!.x + 40, movedBox!.y + 20);
  await page.mouse.down();
  await page.mouse.move(movedBox!.x + 40, movedBox!.y + 20 + hourHeight, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText("La séance a retrouvé sa place")).toBeVisible();
  await expect(moved).toBeVisible();
  await expect(page.getByText(/Ce créneau chevauche/)).toBeVisible();

  await moved.click();
  await page.getByLabel("Début de la séance").fill(`${addCalendarDays(today(), -1)}T10:00`);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByTestId("editor-modal")).toHaveCount(0);
  await page.goto("/taches");
  await page.getByRole("button", { name: "Préparer mon DS", exact: true }).click();
  await page.getByRole("button", { name: "Faire le bilan de la séance", exact: true }).click();
  await page.getByLabel("Temps réellement passé, en minutes").fill("90");
  await page.getByLabel("Avancement total de la tâche, en %").fill("25");
  await page.getByRole("button", { name: "Enregistrer le bilan" }).click();
  await expect(page.getByRole("heading", { name: "Ajuster le temps prévu ?" })).toBeVisible();
  await expect(page.getByLabel("Nouvelle estimation totale, en minutes")).toHaveValue("360");
  await page.getByRole("button", { name: "Ajuster l’estimation", exact: true }).click();
  await expect(page.getByTestId("editor-modal")).toHaveCount(0);
  await page.getByRole("button", { name: "Planifier Préparer mon DS", exact: true }).click();
  await page.getByLabel("Début de la séance").fill(`${tomorrow}T15:00`);
  await page.getByLabel("Durée, en minutes").fill("270");
  await page.getByRole("button", { name: "Planifier la séance" }).click();
  await expect(page.getByTestId("editor-modal")).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Préparer mon DS/ })).toContainText("Planifiée");
  await expect(page.getByRole("row", { name: /Préparer mon DS/ })).toContainText("25 %");
  const html = await (await page.request.get("/taches")).text();
  expect(html).toContain("Préparer mon DS");
  expect(errors).toEqual([]);
});

test("tâche sans tag, réutilisation, doublons, renommage et suppression", async ({ page }) => {
  await signUp(page);
  await openTaskForm(page, "Sans classement");
  await saveTask(page);
  await openTaskForm(page, "Première tâche");
  await addTag(page, "Projet");
  await saveTask(page);
  await openTaskForm(page, "Deuxième tâche");
  const tags = page.getByRole("combobox", { name: "Tags · facultatif" });
  await tags.fill("  PROJET  ");
  await tags.press("ArrowDown");
  await expect(page.getByRole("option", { name: /Créer/ })).toHaveCount(0);
  await page.getByRole("option", { name: "Projet", exact: true }).click();
  await page.getByLabel("Qu’as-tu à faire ?").click();
  await saveTask(page);
  await page.goto("/parametres");
  await page.getByLabel("Nom du tag Projet").fill("Projet personnel");
  await page.getByRole("button", { name: "Renommer", exact: true }).click();
  await expect(page.getByLabel("Nom du tag Projet personnel")).toBeVisible();
  await page.goto("/taches");
  await expect(page.getByRole("row", { name: /Première tâche/ })).toContainText(
    "Projet personnel",
  );
  await expect(page.getByRole("row", { name: /Deuxième tâche/ })).toContainText(
    "Projet personnel",
  );
  await page.getByLabel("Filtrer par tag").selectOption("none");
  await expect(
    page.getByRole("button", { name: "Sans classement", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Première tâche", exact: true })).toHaveCount(
    0,
  );
  await page.goto("/parametres");
  await page.getByRole("button", { name: "Supprimer Projet personnel", exact: true }).click();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.getByLabel("Nom du tag Projet personnel")).toHaveCount(0);
  await page.goto("/taches?tag=none");
  await expect(
    page.getByRole("button", { name: "Première tâche", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Deuxième tâche", exact: true }),
  ).toBeVisible();
});

test("compte vide indépendant, mobile, clavier et thèmes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);
  await expect(page.getByText("Préparer mon DS", { exact: true })).toHaveCount(0);
  await page.goto("/calendrier");
  await expect(page.getByRole("button", { name: "Jour", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Semaine", exact: true })).toHaveCount(0);
  await openTaskForm(page, "Ma tâche mobile");
  await saveTask(page);
  await page.getByRole("button", { name: "Planifier Ma tâche mobile", exact: true }).click();
  await expect(page.getByLabel("Début de la séance")).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.goto("/parametres");
  await page.getByRole("button", { name: "Sombre", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer mes préférences" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Clair", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer mes préférences" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.goto("/taches");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Aller au contenu" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.screenshot({ path: "test-results/mobile-tasks.png", fullPage: true });
});
