import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("déconnexion, récupération par email et connexion avec le nouveau mot de passe", async ({
  page,
}) => {
  const email = await signUp(page);
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("button", { name: "Me connecter", exact: true })).toBeVisible();
  await page.goto("/taches");
  await expect(page).toHaveURL(/\/connexion$/);
  await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
  await expect(
    page.getByRole("heading", { name: "On remet les choses en ordre." }),
  ).toBeVisible();
  await page.getByLabel("Adresse email").fill(email);
  await page.getByRole("button", { name: "Recevoir le lien", exact: true }).click();
  await expect(
    page.getByText("Si cette adresse possède un compte", { exact: false }),
  ).toBeVisible();

  let messageId = "";
  await expect
    .poll(async () => {
      const inbox = await (
        await page.request.get("http://localhost:8025/api/v1/messages?limit=100")
      ).json();
      const message = inbox.messages.find(
        (item: { Subject: string; ID: string; To: { Address: string }[] }) =>
          item.Subject.includes("Réinitialiser") && item.To.some((to) => to.Address === email),
      );
      messageId = message?.ID ?? "";
      return messageId;
    })
    .not.toBe("");
  const message = await (
    await page.request.get(`http://localhost:8025/api/v1/message/${messageId}`)
  ).json();
  const resetUrl = (message.Text as string).match(
    /http:\/\/localhost:3000\/api\/auth\/reset-password\/\S+/,
  )?.[0];
  expect(resetUrl).toBeTruthy();
  await page.goto(resetUrl!);
  const newPassword = "Un-nouveau-mot-de-passe-2026!";
  await page.getByLabel("Mot de passe", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Modifier mon mot de passe", exact: true }).click();
  await expect(
    page.getByText("Ton mot de passe a été modifié.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Connecte-toi", exact: true }).click();
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Me connecter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bonjour Lou." })).toBeVisible();
});
