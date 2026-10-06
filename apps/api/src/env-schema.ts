import { z } from "zod";

const port = z.coerce.number().int().min(1).max(65535);

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    DISABLE_EMAIL_VERIFICATION: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    APP_URL: z.url().default("http://localhost:3000"),
    PORT: port.default(3001),
    SMTP_HOST: z.string().min(1).default("localhost"),
    SMTP_PORT: port.default(1025),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    SMTP_FROM: z.string().min(1).default("UpNext <bonjour@upnext.local>"),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    AUTH_IP_HEADER: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .default("x-real-ip"),
  })
  .superRefine((value, context) => {
    // URL validation already reports malformed values; do not throw while refining.
    if (!URL.canParse(value.APP_URL) || !URL.canParse(value.DATABASE_URL)) return;
    const appUrl = new URL(value.APP_URL);
    if (
      !["http:", "https:"].includes(appUrl.protocol) ||
      appUrl.username ||
      appUrl.password ||
      appUrl.pathname !== "/" ||
      appUrl.search ||
      appUrl.hash
    ) {
      context.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "APP_URL doit être une origine HTTP(S), sans chemin ni identifiants.",
      });
    }
    const databaseUrl = new URL(value.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL doit désigner PostgreSQL.",
      });
    }
    if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD)) {
      context.addIssue({
        code: "custom",
        path: ["SMTP_USER"],
        message: "Renseigne ensemble SMTP_USER et SMTP_PASSWORD.",
      });
    }
    if (value.NODE_ENV !== "production") return;
    if (appUrl.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "La production nécessite une origine HTTPS.",
      });
    }
    if (/replace|example|development|dev-secret/i.test(value.BETTER_AUTH_SECRET)) {
      context.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "Remplace le secret d'exemple par un secret aléatoire.",
      });
    }
    let databasePassword: string;
    try {
      databasePassword = decodeURIComponent(databaseUrl.password);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "Le mot de passe PostgreSQL doit être encodé correctement dans l'URL.",
      });
      return;
    }
    if (
      /replace|example|development/i.test(databasePassword) ||
      databasePassword.length < 16 ||
      databaseUrl.password === "upnext"
    ) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "Choisis un mot de passe PostgreSQL de production.",
      });
    }
    if (
      appUrl.hostname.endsWith(".example.com") ||
      value.SMTP_HOST.endsWith(".example.com") ||
      /@(?:upnext\.local|example\.(?:com|fr))\b/i.test(value.SMTP_FROM)
    ) {
      context.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "Remplace les domaines d'exemple et l'expéditeur SMTP.",
      });
    }
  });
