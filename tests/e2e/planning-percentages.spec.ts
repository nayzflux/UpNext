import { expect, test } from "@playwright/test";
import { addCalendarDays, localDate } from "../../packages/contracts/src/domain";
import { openTaskForm, saveTask, setDateTime, signUp } from "./helpers";

test("le reste à planifier suit les parts prévues, indépendamment des durées", async ({
  page,
}) => {
  await signUp(page);
  await openTaskForm(page, "Lecture courte");
  await page.getByLabel("Temps estimé, en minutes").fill("60");
  await saveTask(page);

  const date = addCalendarDays(localDate(new Date(), "Europe/Paris"), 1);
  await page.goto(`/calendrier?date=${date}`);
  await page.getByRole("button", { name: "Jour", exact: true }).click();
  const backlog = page.locator(".backlog-task").filter({ hasText: "Lecture courte" });

  await expect(backlog).toContainText("1 h à placer");
  await backlog.getByRole("button", { name: "Planifier Lecture courte" }).click();
  const durationInput = page.getByLabel("Durée, en minutes");
  const percentInput = page.getByLabel("Part de la tâche, en %");
  await durationInput.fill("30");
  await expect(percentInput).toHaveValue("");
  await expect(percentInput).toHaveAttribute("placeholder", "50 % proposé");
  await setDateTime(page, "Début de la séance", `${date}T10:00`);
  await page.getByRole("button", { name: "Planifier la séance" }).click();
  await expect(backlog).toContainText("30 min à placer");

  await backlog.getByRole("button", { name: "Planifier Lecture courte" }).click();
  await durationInput.fill("60");
  await expect(percentInput).toHaveAttribute("placeholder", "50 % proposé");
  await percentInput.fill("10");
  await expect(durationInput).toHaveValue("60");
  await setDateTime(page, "Début de la séance", `${date}T12:00`);
  await page.getByRole("button", { name: "Planifier la séance" }).click();
  await expect(backlog).toContainText("24 min à placer");

  await backlog.getByRole("button", { name: "Planifier Lecture courte" }).click();
  await percentInput.fill("41");
  await expect(page.getByText("La part totale planifiée dépasserait les 100 %")).toBeVisible();
  await expect(page.getByRole("button", { name: "Planifier la séance" })).toBeDisabled();
  await percentInput.fill("40");
  await durationInput.fill("120");
  await expect(percentInput).toHaveValue("40");
  await setDateTime(page, "Début de la séance", `${date}T15:00`);
  await page.getByRole("button", { name: "Planifier la séance" }).click();
  await expect(backlog).toHaveCount(0);
});
