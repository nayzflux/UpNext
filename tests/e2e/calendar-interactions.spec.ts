import { expect, test } from "@playwright/test";
import { addCalendarDays, localDate } from "../../packages/contracts/src/domain";
import { pixelsPerMinute, quarterHeight } from "../../apps/web/src/lib/calendar-layout";
import { signUp, openTaskForm, saveTask, setDateTime } from "./helpers";

test("modal centré, aperçu à taille réelle, snap et redimensionnement sur la carte", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];

  page.on("console", (message) => {
    if (/hydrated|server rendered html/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });

  await page.setViewportSize({ width: 1440, height: 1100 });
  await signUp(page);
  await openTaskForm(page, "Séance de deux heures");
  const modal = page.getByTestId("editor-modal");
  const modalBox = await modal.boundingBox();
  expect(modalBox!.x + modalBox!.width / 2).toBeCloseTo(720, 0);
  expect(modalBox!.width).toBeGreaterThan(500);
  await page.getByLabel("Temps estimé, en minutes").fill("120");
  await saveTask(page);
  const date = addCalendarDays(localDate(new Date(), "Europe/Paris"), 1);
  await page.goto(`/calendrier?date=${date}`);
  await page.reload();
  await page.getByRole("button", { name: "Jour", exact: true }).click();
  await page
    .getByRole("button", { name: "Planifier Séance de deux heures", exact: true })
    .click();
  await expect(page.getByLabel("Durée, en minutes")).toHaveValue("");
  await page.getByLabel("Durée, en minutes").fill("120");
  await setDateTime(page, "Début de la séance", `${date}T10:00`);
  await page.getByRole("button", { name: "Planifier la séance", exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(
    await page.locator(".calendar-grid-container").evaluate((element) => ({
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflow: getComputedStyle(element).overflowY,
    })),
  ).toMatchObject({ overflow: "visible" });
  await expect(page.getByRole("grid")).toBeVisible();

  const card = page.getByTestId("session-card");
  const original = await card.boundingBox();
  expect(original!.height).toBeCloseTo(120 * pixelsPerMinute, 0);
  await page.mouse.move(original!.x + 30, original!.y + 10);
  await page.mouse.down();
  await page.mouse.move(original!.x + 30, original!.y + 20, { steps: 5 });
  const preview = page.getByTestId("calendar-drag-preview");
  await expect(preview).toBeVisible();
  let projected = await preview.boundingBox();
  expect(projected!.height).toBeCloseTo(original!.height, 0);
  expect(projected!.width).toBeCloseTo(original!.width, 0);
  expect(projected!.y).toBeCloseTo(original!.y + quarterHeight, 0);
  await page.mouse.move(original!.x + 30, original!.y + 31, { steps: 4 });
  await expect(preview).toContainText("10:30–12:30");
  projected = await preview.boundingBox();
  expect(projected!.y).toBeCloseTo(original!.y + quarterHeight * 2, 0);
  await page.screenshot({ path: "test-results/calendar-snap.png" });
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(card).toContainText("10:30–12:30");
  const dropped = await card.boundingBox();
  expect(dropped).toEqual(projected);

  const originalNode = await card.elementHandle();
  const handle = page.getByRole("button", { name: "Redimensionner Séance de deux heures" });
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox!.x + 30, handleBox!.y + 5);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + 30, handleBox!.y + 5 + 30 * pixelsPerMinute, {
    steps: 8,
  });
  await expect(card).toHaveAttribute("data-resizing", "true");
  await expect(preview).toHaveCount(0);
  await expect(card).toContainText("10:30–13:00");
  const resized = await card.boundingBox();
  expect(resized!.height).toBeCloseTo(150 * pixelsPerMinute, 0);
  expect(resized!.y).toBeCloseTo(dropped!.y, 0);
  expect(await originalNode!.evaluate((element) => element.isConnected)).toBe(true);
  await page.screenshot({ path: "test-results/calendar-resize.png" });
  await page.mouse.up();
  await expect(page.getByText("Planning mis à jour").last()).toBeVisible();
  await expect(card).not.toHaveAttribute("data-resizing", "true");
  await expect(card).toContainText("10:30–13:00");
  expect((await card.boundingBox())!.height).toBeCloseTo(resized!.height, 0);

  const mainButton = card.getByRole("button", { name: /Déplacer ou ouvrir/ });
  await mainButton.focus();
  await page.keyboard.press("Space");
  await expect(preview).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(preview).toContainText("10:45–13:15");
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(card).toContainText("10:30–13:00");

  await openTaskForm(page, "Lecture à répartir");
  await page.getByLabel("Temps estimé, en minutes").fill("180");
  await saveTask(page);
  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await page.getByLabel("Durée à placer pour Lecture à répartir, en minutes").fill("120");
  const source = page.getByRole("button", {
    name: "Glisser Lecture à répartir dans le calendrier",
  });
  const sourceBox = await source.boundingBox();
  const nextDate = addCalendarDays(date, 1);
  const target = page.locator(`[data-calendar-date="${nextDate}"]`);
  const targetBox = await target.boundingBox();
  await page.mouse.move(sourceBox!.x + 5, sourceBox!.y + 5);
  await page.mouse.down();
  await page.mouse.move(
    targetBox!.x + targetBox!.width / 2,
    targetBox!.y + 120 * pixelsPerMinute,
    { steps: 12 },
  );
  await expect(preview).toContainText("10:00–12:00");
  const backlogPreview = await preview.boundingBox();
  expect(backlogPreview!.height).toBeCloseTo(120 * pixelsPerMinute, 0);
  const columnBorder = await target.evaluate((element) =>
    parseFloat(getComputedStyle(element).borderLeftWidth),
  );
  expect(backlogPreview!.width).toBeCloseTo(targetBox!.width - columnBorder - 6, 0);
  await page.mouse.up();
  await expect(modal).toBeVisible();
  await expect(page.getByLabel("Durée, en minutes")).toHaveValue("120");
  await expect(page.getByRole("group", { name: "Début de la séance" })).toHaveAttribute(
    "data-value",
    `${nextDate}T10:00`,
  );
  await page.getByRole("button", { name: "Planifier la séance", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(target.getByTestId("session-card")).toContainText("Lecture à répartir");
  expect((await target.getByTestId("session-card").boundingBox())!.height).toBeCloseTo(
    backlogPreview!.height,
    0,
  );
  expect((await target.getByTestId("session-card").boundingBox())!.width).toBeCloseTo(
    backlogPreview!.width,
    0,
  );
  expect(hydrationErrors).toEqual([]);
});

test("séances courtes (15 min) : lisibilité, compacité et poignée de redimensionnement au survol", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await signUp(page);
  await openTaskForm(page, "Point rapide 15m");
  await page.getByLabel("Temps estimé, en minutes").fill("15");
  await saveTask(page);

  const date = addCalendarDays(localDate(new Date(), "Europe/Paris"), 1);
  await page.goto(`/calendrier?date=${date}`);
  await page.reload();
  await page.getByRole("button", { name: "Jour", exact: true }).click();
  await page.getByRole("button", { name: "Planifier Point rapide 15m", exact: true }).click();
  await setDateTime(page, "Début de la séance", `${date}T09:00`);
  await page.getByLabel("Durée, en minutes").fill("15");
  await page.getByRole("button", { name: "Planifier la séance", exact: true }).click();
  const modal = page.getByTestId("editor-modal");
  await expect(modal).toHaveCount(0);

  const card15 = page.getByTestId("session-card");
  await expect(card15).toHaveAttribute("data-duration", "15");
  await expect(card15).toHaveClass(/is-short-block/);
  await expect(card15).toContainText("Point rapide 15m");

  const box15 = await card15.boundingBox();
  expect(box15!.height).toBeCloseTo(15 * pixelsPerMinute, 0);

  const handle15 = card15.getByRole("button", { name: /Redimensionner/ });
  await expect(handle15).toHaveCSS("opacity", "0");

  await card15.hover();
  await expect(handle15).toHaveCSS("opacity", "1");

  await card15.getByRole("button", { name: /Déplacer ou ouvrir/ }).click();
  await expect(modal).toBeVisible();
  await expect(page.getByLabel("Durée, en minutes")).toHaveValue("15");
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
});
