import { expect, test } from "@playwright/test";
import { addCalendarDays, localDate } from "../../packages/contracts/src/domain";
import { addTag, openTaskForm, saveTask, setDateTime, signUp } from "./helpers";

test("les quatre écrans restent utilisables de 320 à 1440 px dans les deux thèmes", async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/hydrated|hydration|server rendered html/i.test(message.text()))
      errors.push(message.text());
  });
  await signUp(page);
  const planningDate = addCalendarDays(localDate(new Date(), "Europe/Paris"), 1);
  const title =
    "Dossier de recherche avec un titre très long pour vérifier les cartes et les formulaires sur petit écran";
  for (const state of ["empty", "populated"]) {
    if (state === "populated") {
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.goto("/taches");
      await openTaskForm(page, title);
      await page.getByLabel("Temps estimé, en minutes").fill("180");
      await page
        .getByLabel("Quelques détails · facultatif")
        .fill("Un lien sans espaces " + "long".repeat(80));
      await addTag(page, "Recherche et documentation approfondie");
      await saveTask(page);
      for (const time of ["08:00", "12:00", "18:00"]) {
        await page.getByRole("button", { name: `Planifier ${title}`, exact: true }).click();
        await setDateTime(page, "Début de la séance", `${planningDate}T${time}`);
        await page.getByLabel("Durée, en minutes").fill("30");
        await page.getByRole("button", { name: "Planifier la séance", exact: true }).click();
        await expect(page.getByTestId("editor-modal")).toHaveCount(0);
      }
      await page.goto(`/calendrier?date=${planningDate}`);
      await page.getByRole("button", { name: "Événement", exact: true }).click();
      await page
        .getByLabel("Nom de l’événement")
        .fill("Présentation du dossier de recherche et discussion avec toute la promotion");
      await setDateTime(page, "Début", `${planningDate}T10:00`);
      await setDateTime(page, "Fin", `${planningDate}T11:30`);
      await page.getByRole("button", { name: "Créer l’événement", exact: true }).click();
      await expect(page.getByTestId("editor-modal")).toHaveCount(0);
    }
    for (const theme of ["Clair", "Sombre"]) {
      await page.goto("/parametres");
      await page.getByRole("button", { name: theme, exact: true }).click();
      await page.getByRole("button", { name: "Enregistrer mes préférences" }).click();
      await expect(page.locator("html")).toHaveClass(theme === "Sombre" ? /dark/ : /light/);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of ["aujourdhui", "taches", "calendrier", "parametres"]) {
          await page.goto(
            route === "calendrier" ? `/${route}?date=${planningDate}` : `/${route}`,
          );
          await expect(page.locator("#main-content h1")).toBeVisible();
          const layout = await page.evaluate(() => ({
            width: window.innerWidth,
            content: document.documentElement.scrollWidth,
          }));
          expect(layout.content, `${state}/${theme}/${route}/${width}`).toBeLessThanOrEqual(
            layout.width,
          );
          if (route === "taches" && state === "populated" && width === 1440) {
            const cellsFit = await page
              .locator(".desktop-task-table td")
              .evaluateAll((cells) =>
                cells.every((cell) => cell.scrollWidth <= cell.clientWidth + 1),
              );
            expect(
              cellsFit,
              "Les titres et tags ne doivent pas empiéter sur les autres colonnes",
            ).toBe(true);
          }
          if (route === "taches" && state === "populated") {
            const contrast = await page
              .locator('[data-priority="normal"]')
              .filter({ visible: true })
              .first()
              .evaluate((badge) => {
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = 1;
                const context = canvas.getContext("2d")!;
                const styles = getComputedStyle(badge);
                context.fillStyle = styles.getPropertyValue("--card");
                context.fillRect(0, 0, 1, 1);
                context.fillStyle = styles.backgroundColor;
                context.fillRect(0, 0, 1, 1);
                const background = context.getImageData(0, 0, 1, 1).data;
                context.fillStyle = styles.color;
                context.fillRect(0, 0, 1, 1);
                const foreground = context.getImageData(0, 0, 1, 1).data;
                function luminance(color: Uint8ClampedArray) {
                  return [0.2126, 0.7152, 0.0722].reduce((total, weight, index) => {
                    const channel = color[index] / 255;
                    const linear =
                      channel <= 0.04045
                        ? channel / 12.92
                        : ((channel + 0.055) / 1.055) ** 2.4;
                    return total + weight * linear;
                  }, 0);
                }
                const light = Math.max(luminance(background), luminance(foreground));
                const dark = Math.min(luminance(background), luminance(foreground));
                return (light + 0.05) / (dark + 0.05);
              });
            expect(contrast, `Contraste du badge ${theme}/${width}`).toBeGreaterThanOrEqual(
              4.5,
            );
          }
          if (route === "calendrier" && state === "populated") {
            const titlesFit = await page
              .locator(".calendar-block strong")
              .evaluateAll((titles) =>
                titles.every((title) => title.clientHeight + 1 >= title.scrollHeight),
              );
            expect(
              titlesFit,
              "Les titres des séances courtes restent entièrement visibles en hauteur",
            ).toBe(true);
          }
          await page.screenshot({
            path: `.artifacts/qa/${state}-${theme}-${route}-${width}.png`,
            fullPage: true,
          });
        }
      }
    }
  }
  expect(errors).toEqual([]);
});

test("la fermeture protège les saisies et une session expirée demande de se reconnecter", async ({
  page,
  context,
}) => {
  await signUp(page);
  await openTaskForm(page, "Une saisie à conserver");
  await page.keyboard.press("Escape");
  const warning = page.getByRole("alertdialog", { name: "Abandonner les modifications ?" });
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "Continuer à modifier" }).click();
  await expect(page.getByLabel("Qu’as-tu à faire ?")).toHaveValue("Une saisie à conserver");
  await page.keyboard.press("Escape");
  await warning.getByRole("button", { name: "Abandonner", exact: true }).click();
  await expect(page.getByTestId("editor-modal")).toHaveCount(0);
  await openTaskForm(page, "Un brouillon après expiration");
  await context.clearCookies();
  await page.getByLabel("Temps estimé, en minutes").fill("60");
  // Submit a valid form after losing the session, without reloading the draft.
  await saveTaskWithExpiredSession();
  await expect(page.getByText("Ta session a expiré.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Qu’as-tu à faire ?")).toHaveValue(
    "Un brouillon après expiration",
  );
  await page.keyboard.press("Escape");
  await warning.getByRole("button", { name: "Abandonner", exact: true }).click();
  await page.goto("/taches");
  await expect(page).toHaveURL(/\/connexion$/);

  async function saveTaskWithExpiredSession() {
    await page.locator("#task-date").click();
    await page.locator("[data-day]").filter({ visible: true }).last().click();
    await page.getByRole("button", { name: "Créer la tâche", exact: true }).click();
  }
});
