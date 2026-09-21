import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

export const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    APP_URL: z.url().default("http://localhost:3000"),
    PORT: z.coerce.number().default(3001),
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_SECURE: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    SMTP_FROM: z.string().default("UpNext <bonjour@upnext.local>"),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
  })
  .parse(process.env);
