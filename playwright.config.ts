import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    ignoreHTTPSErrors: process.env.E2E_HTTPS_IGNORE_ERRORS === "true",
    timezoneId: "Europe/Paris",
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /mobile-production\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args:
            process.env.E2E_HTTPS_IGNORE_ERRORS === "true"
              ? ["--ignore-certificate-errors"]
              : [],
        },
      },
    },
    {
      name: "android",
      testMatch: /mobile-production\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "iphone",
      testMatch: /mobile-production\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer:
    process.env.E2E_EXTERNAL_SERVER === "true"
      ? undefined
      : {
          command: "bun run dev",
          url: "http://localhost:3000/connexion",
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        },
});
