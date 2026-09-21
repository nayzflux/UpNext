import { expect, test, type Page } from "@playwright/test";
const password = "Local-test-UpNext-2026!";

export async function signUp(page: Page) {
  const email = `e2e-${crypto.randomUUID()}@upnext.local`;
  await page.goto("/inscription");
  await page.getByLabel("Ton prénom").fill("Lou");
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  for (let attempt = 0; attempt < 3; attempt++) {
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/sign-up/email"),
    );
    await page.getByRole("button", { name: "Créer mon espace" }).click();
    const response = await responsePromise;
    if (response.status() !== 429) break;
    // Repeated local runs share the real authentication rate limit.
    const retrySeconds = Number(await response.headerValue("retry-after")) || 60;
    const retryMilliseconds = (retrySeconds + 1) * 1000;
    test.setTimeout(test.info().timeout + retryMilliseconds);
    await new Promise((resolve) => setTimeout(resolve, retryMilliseconds));
  }
  await expect(
    page.getByText("Un email de confirmation t’attend.", { exact: false }),
  ).toBeVisible();
  let messageId = "";
  await expect
    .poll(async () => {
      const response = await page.request.get(
        "http://localhost:8025/api/v1/messages?limit=100",
      );
      const inbox = await response.json();
      const message = inbox.messages.find((item: { To: { Address: string }[] }) =>
        item.To.some((to) => to.Address === email),
      );
      messageId = message?.ID ?? "";
      return messageId;
    })
    .not.toBe("");
  const message = await (
    await page.request.get(`http://localhost:8025/api/v1/message/${messageId}`)
  ).json();
  const verificationUrl = (message.Text as string).match(
    /http:\/\/localhost:3000\/api\/auth\/verify-email\?\S+/,
  )?.[0];
  expect(verificationUrl).toBeTruthy();
  await page.goto(verificationUrl!);
  await expect(page.getByRole("heading", { name: "Bonjour Lou." })).toBeVisible();
  return email;
}

export async function openTaskForm(page: Page, title: string) {
  await page
    .getByRole("button", { name: "Nouvelle tâche", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByLabel("Qu’as-tu à faire ?").fill(title);
}

export async function addTag(page: Page, name: string, create = true) {
  const input = page.getByRole("combobox", { name: "Tags · facultatif" });
  await input.fill(name);
  await input.press("ArrowDown");
  await page
    .getByRole("option", { name: create ? `Créer « ${name} »` : name, exact: true })
    .click();
  await expect(
    page.getByTestId("editor-modal").getByText(name, { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Qu’as-tu à faire ?").click();
}

export async function saveTask(page: Page) {
  await page.getByRole("button", { name: "Créer la tâche", exact: true }).click();
  await expect(page.getByTestId("editor-modal")).toHaveCount(0);
}
