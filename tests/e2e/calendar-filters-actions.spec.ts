import { expect, test, type Page } from "@playwright/test";
import { addCalendarDays, localDate } from "../../packages/contracts/src/domain";
import { addTag, openTaskForm, saveTask, setDateTime, signUp } from "./helpers";

const tomorrow = () => addCalendarDays(localDate(new Date(), "Europe/Paris"), 1);

async function createTask(
  page: Page,
  input: {
    title: string;
    minutes: number;
    priority?: "low" | "normal" | "high";
    tag?: string;
  },
) {
  await openTaskForm(page, input.title);
  await page.getByLabel("Temps estimé, en minutes").fill(String(input.minutes));
  if (input.priority && input.priority !== "normal") {
    const label = input.priority === "high" ? "Haute" : "Basse";
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  if (input.tag) {
    await addTag(page, input.tag);
  }
  await saveTask(page);
}

async function planTask(page: Page, title: string, time: string, minutes: number) {
  await page.getByRole("button", { name: `Planifier ${title}`, exact: true }).click();
  await setDateTime(page, "Début de la séance", `${tomorrow()}T${time}`);
  await page.getByLabel("Durée, en minutes").fill(String(minutes));
  await page.getByRole("button", { name: "Planifier la séance", exact: true }).click();
}

test("badges de priorité et filtre supérieur des tâches non planifiées", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await signUp(page);
  await createTask(page, {
    title: "Projet partiel",
    minutes: 120,
    priority: "high",
  });
  await createTask(page, {
    title: "À placer",
    minutes: 60,
    priority: "low",
  });
  await createTask(page, {
    title: "Déjà planifiée",
    minutes: 60,
  });

  await page.goto("/taches");
  await planTask(page, "Projet partiel", "09:00", 60);
  await planTask(page, "Déjà planifiée", "11:00", 60);

  await expect(page.getByRole("combobox", { name: "Filtrer par planification" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Non planifiées", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Projet partiel", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "À placer", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Déjà planifiée", exact: true })).toHaveCount(
    0,
  );

  const highRow = page.getByRole("row", { name: /Projet partiel/ });
  const lowRow = page.getByRole("row", { name: /À placer/ });
  await expect(highRow.locator('[data-priority="high"]')).toContainText("Haute");
  await expect(lowRow.locator('[data-priority="low"]')).toContainText("Basse");
  await highRow.getByRole("button", { name: "Projet partiel", exact: true }).click();
  await expect(
    page.getByTestId("editor-modal").locator('[data-priority="high"]'),
  ).toContainText("Priorité haute");
});

test("filtres du calendrier et menu contextuel des séances", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await signUp(page);
  await createTask(page, {
    title: "Révisions filtrées",
    minutes: 120,
    priority: "high",
    tag: "Études",
  });
  await createTask(page, {
    title: "Sans classement calendrier",
    minutes: 60,
    priority: "low",
  });

  await page.goto("/taches");
  await planTask(page, "Révisions filtrées", "10:00", 60);
  await page.goto(`/calendrier?date=${tomorrow()}`);
  await page.getByRole("button", { name: "Jour", exact: true }).click();
  await page.getByRole("button", { name: "Événement", exact: true }).click();
  await page.getByLabel("Nom de l’événement").fill("Cours extérieur");
  await setDateTime(page, "Début", `${tomorrow()}T14:00`);
  await setDateTime(page, "Fin", `${tomorrow()}T15:00`);
  await page.getByRole("button", { name: "Créer l’événement", exact: true }).click();

  const session = page.getByTestId("session-card");
  const event = page.getByText("Cours extérieur", { exact: true });
  await expect(session).toBeVisible();
  await expect(event).toBeVisible();
  await page.getByRole("button", { name: "Tâches", exact: true }).click();
  await expect(session).toBeVisible();
  await expect(event).toHaveCount(0);
  await page.getByRole("button", { name: "Événements", exact: true }).click();
  await expect(session).toHaveCount(0);
  await expect(event).toBeVisible();
  await expect(page.locator(".calendar-backlog")).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Filtrer le calendrier par tag" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Tout", exact: true }).click();
  await page.getByRole("combobox", { name: "Filtrer le calendrier par tag" }).click();
  await page.getByRole("option", { name: "Études", exact: true }).click();
  await expect(session).toBeVisible();
  await expect(
    page.locator(".backlog-task").filter({ hasText: "Révisions filtrées" }),
  ).toBeVisible();
  await expect(
    page.locator(".backlog-task").filter({ hasText: "Sans classement calendrier" }),
  ).toHaveCount(0);

  await session.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Modifier la séance" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Ouvrir la tâche" }).click();
  await expect(page.getByRole("heading", { name: "Révisions filtrées" })).toBeVisible();
  await page.keyboard.press("Escape");

  await session.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Supprimer la séance" }).click();
  const alert = page.getByRole("alertdialog");
  await expect(alert).toContainText("Supprimer cette séance ?");
  await alert.getByRole("button", { name: "Annuler" }).click();
  await expect(session).toBeVisible();

  await session.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Supprimer la séance" }).click();
  await alert.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(alert).toHaveCount(0);
  await expect(session).toHaveCount(0);
  await expect(
    page.locator(".backlog-task").filter({ hasText: "Révisions filtrées" }),
  ).toContainText("à placer");
});
