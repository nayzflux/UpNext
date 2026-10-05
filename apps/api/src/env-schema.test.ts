import { describe, expect, it } from "vitest";
import { environmentSchema } from "./env-schema";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://upnext:random-production-password@postgres:5432/upnext",
  BETTER_AUTH_SECRET: "a09f68bc058862d891195e80cf341c72ee9c72858b352876d",
  APP_URL: "https://upnext.school.fr",
  SMTP_HOST: "smtp.school.fr",
  SMTP_PORT: "587",
  SMTP_FROM: "UpNext <bonjour@school.fr>",
};

describe("configuration de production", () => {
  it("accepte une origine HTTPS et le SMTP STARTTLS", () => {
    expect(environmentSchema.parse(production).SMTP_SECURE).toBe(false);
  });
  it.each([
    { APP_URL: "not-a-url" },
    { DATABASE_URL: "not-a-url" },
    { DATABASE_URL: "postgres://upnext:%ZZ@postgres/upnext" },
    { APP_URL: "http://upnext.school.fr" },
    { APP_URL: "https://upnext.school.fr/path" },
    { APP_URL: "https://upnext.example.com" },
    { BETTER_AUTH_SECRET: "replace-with-a-random-secret-of-at-least-32-characters" },
    { DATABASE_URL: "postgres://upnext:upnext@postgres/upnext" },
    { DATABASE_URL: "https://database.school.fr" },
    { SMTP_SECURE: "yes" },
    { SMTP_PORT: "0" },
    { SMTP_USER: "mailer" },
    { SMTP_FROM: "UpNext <bonjour@example.com>" },
  ])("refuse une configuration incorrecte : %j", (override) => {
    expect(environmentSchema.safeParse({ ...production, ...override }).success).toBe(false);
  });
  it("conserve les valeurs locales de développement", () => {
    expect(
      environmentSchema.parse({
        DATABASE_URL: "postgres://upnext:upnext@localhost:5433/upnext",
        BETTER_AUTH_SECRET: "development-secret-at-least-32-characters",
      }).APP_URL,
    ).toBe("http://localhost:3000");
  });
});
