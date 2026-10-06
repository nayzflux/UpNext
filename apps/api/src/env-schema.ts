import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const port = z.coerce.number().int().min(1).max(65535);

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    DISABLE_EMAIL_VERIFICATION: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    APP_URL: z.string().min(1).default("http://localhost:3000"),
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
    if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD)) {
      context.addIssue({
        code: "custom",
        path: ["SMTP_USER"],
        message: "Renseigne ensemble SMTP_USER et SMTP_PASSWORD.",
      });
    }
    if (
      value.NODE_ENV === "production" &&
      /replace|example|development|dev-secret/i.test(value.BETTER_AUTH_SECRET)
    ) {
      context.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "Remplace le secret d'exemple par un secret aléatoire.",
      });
    }
  });

export function createApiEnv(runtimeEnv: Record<string, string | undefined>) {
  return createEnv({
    server: environmentSchema.shape,
    runtimeEnv: { ...runtimeEnv },
    isServer: true,
    emptyStringAsUndefined: true,
    createFinalSchema: () => environmentSchema,
  });
}
