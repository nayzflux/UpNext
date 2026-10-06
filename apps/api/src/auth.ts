import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import nodemailer from "nodemailer";
import { db } from "./db";
import * as schema from "./db/schema";
import { env } from "./env";

const mail = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
});

export const auth = betterAuth({
  appName: "UpNext",
  baseURL: env.APP_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  advanced: {
    useSecureCookies: new URL(env.APP_URL).protocol === "https:",
    ipAddress: { ipAddressHeaders: [env.AUTH_IP_HEADER] },
  },
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: !env.DISABLE_EMAIL_VERIFICATION,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user, url }) {
      await mail.sendMail({
        from: env.SMTP_FROM,
        to: user.email,
        subject: "Réinitialiser ton mot de passe UpNext",
        text: `Pour choisir un nouveau mot de passe, ouvre ce lien :\n\n${url}\n\nSi tu n’es pas à l’origine de cette demande, ignore ce message.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: !env.DISABLE_EMAIL_VERIFICATION,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      await mail.sendMail({
        from: env.SMTP_FROM,
        to: user.email,
        subject: "Bienvenue sur UpNext, confirme ton adresse",
        text: `Confirme ton adresse pour commencer à organiser tes journées :\n\n${url}`,
      });
    },
  },
  rateLimit: {
    enabled: true,
    storage: env.NODE_ENV === "production" ? "database" : "memory",
    // Server renders repeatedly read the same session without a client IP.
    // Keep abuse limits on authentication writes, not these read-only lookups.
    customRules: { "/get-session": false },
  },
});
