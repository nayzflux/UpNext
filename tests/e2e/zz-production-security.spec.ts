import { expect, test } from "@playwright/test";
import { openTaskForm, saveTask, signUp } from "./helpers";

test("HTTPS protège les cookies, les origines et les données hors connexion", async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(
    !baseURL?.startsWith("https:"),
    "Ce contrôle nécessite la pile HTTPS de production.",
  );
  await signUp(page);
  const sessionCookie = (await context.cookies()).find((cookie) =>
    cookie.name.includes("session_token"),
  );
  expect(sessionCookie?.secure).toBe(true);
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe("Lax");
  const crossOrigin = await page.request.post("/api/rpc/tasks/create", {
    headers: { origin: "https://attacker.invalid" },
    data: {},
  });
  expect(crossOrigin.status()).toBe(403);
  const response = await page.request.get("/connexion");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  await openTaskForm(page, "Une tâche privée à ne pas cacher hors ligne");
  await saveTask(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const cachedPaths = await page.evaluate(async () => {
    const requests = await Promise.all(
      (await caches.keys()).map(async (key) =>
        (await (await caches.open(key)).keys()).map(
          (request) => new URL(request.url).pathname,
        ),
      ),
    );
    return requests.flat();
  });
  expect(cachedPaths).toEqual(["/offline.html"]);
  await context.setOffline(true);
  await page.goto("/taches");
  await expect(page.getByRole("heading", { name: "Tu es hors connexion" })).toBeVisible();
  await expect(page.getByText("Une tâche privée à ne pas cacher hors ligne")).toHaveCount(0);
  await context.setOffline(false);
});

test("le proxy écrase les adresses client fournies et la connexion est limitée", async ({
  request,
  baseURL,
}) => {
  test.skip(!baseURL?.startsWith("https:"), "Ce contrôle nécessite le proxy de validation.");
  const statuses: number[] = [];
  for (let index = 0; index < 6; index++) {
    const response = await request.post("/api/auth/sign-in/email", {
      headers: { origin: baseURL!, "x-real-ip": `198.51.100.${index + 1}` },
      data: { email: "absent@upnext.test", password: "Wrong-password-2026!" },
    });
    statuses.push(response.status());
  }
  expect(statuses).toContain(429);
  expect(statuses).not.toContain(500);
});
