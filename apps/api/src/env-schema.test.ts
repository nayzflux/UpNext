import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiEnv } from "./env-schema";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://upnext:random-production-password@postgres:5432/upnext",
  BETTER_AUTH_SECRET: "a09f68bc058862d891195e80cf341c72ee9c72858b352876d",
  APP_URL: "https://upnext.school.fr",
  SMTP_HOST: "smtp.school.fr",
  SMTP_PORT: "587",
  SMTP_FROM: "UpNext <bonjour@school.fr>",
};

describe("configuration de l'API avec T3 Env", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("convertit les ports et applique les valeurs par défaut", () => {
    const env = createApiEnv(production);
    expect(env.SMTP_PORT).toBe(587);
    expect(env.PORT).toBe(3001);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.DISABLE_EMAIL_VERIFICATION).toBe(false);
  });

  it.each([
    { APP_URL: "not-a-url" },
    { DATABASE_URL: "not-a-url" },
    { DATABASE_URL: "postgres://upnext:%ZZ@postgres/upnext" },
    { APP_URL: "http://upnext.school.fr" },
    { APP_URL: "https://upnext.school.fr/path" },
    { APP_URL: "https://upnext.example.com" },
    { DATABASE_URL: "postgres://upnext:upnext@postgres/upnext" },
    { DATABASE_URL: "https://database.school.fr" },
  ])("conserve les chaînes sans valider leur format URL : %j", (override) => {
    expect(createApiEnv({ ...production, ...override })).toMatchObject(override);
  });

  it.each([
    { DATABASE_URL: undefined },
    { DATABASE_URL: "" },
    { BETTER_AUTH_SECRET: undefined },
    { BETTER_AUTH_SECRET: "too-short" },
    { BETTER_AUTH_SECRET: "replace-with-a-random-secret-of-at-least-32-characters" },
    { NODE_ENV: "unknown" },
    { SMTP_SECURE: "yes" },
    { SMTP_PORT: "0" },
    { PORT: "65536" },
    { SMTP_USER: "mailer" },
    { SMTP_PASSWORD: "password" },
  ])("refuse les valeurs manquantes ou les types incorrects : %j", (override) => {
    expect(() => createApiEnv({ ...production, ...override })).toThrow(
      "Invalid environment variables",
    );
  });

  it("conserve les valeurs locales de développement", () => {
    expect(
      createApiEnv({
        DATABASE_URL: "postgres://upnext:upnext@localhost:5433/upnext",
        BETTER_AUTH_SECRET: "development-secret-at-least-32-characters",
      }).APP_URL,
    ).toBe("http://localhost:3000");
  });

  it("normalise les valeurs vides sans modifier l'environnement fourni", () => {
    const runtimeEnv = {
      DATABASE_URL: production.DATABASE_URL,
      BETTER_AUTH_SECRET: production.BETTER_AUTH_SECRET,
      APP_URL: "",
      PORT: "",
      SMTP_PORT: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
    };
    const env = createApiEnv(runtimeEnv);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.PORT).toBe(3001);
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASSWORD).toBeUndefined();
    expect(runtimeEnv.APP_URL).toBe("");
  });

  it("accepte les identifiants SMTP ensemble et convertit les options booléennes", () => {
    const env = createApiEnv({
      ...production,
      SMTP_USER: "mailer",
      SMTP_PASSWORD: "password",
      SMTP_SECURE: "true",
      DISABLE_EMAIL_VERIFICATION: "true",
    });
    expect(env.SMTP_USER).toBe("mailer");
    expect(env.SMTP_PASSWORD).toBe("password");
    expect(env.SMTP_SECURE).toBe(true);
    expect(env.DISABLE_EMAIL_VERIFICATION).toBe(true);
  });
});
