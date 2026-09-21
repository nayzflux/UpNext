import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { RPCHandler } from "@orpc/server/fetch";
import { auth } from "./auth";
import { env } from "./env";
import { router } from "./router";

export const app = new Hono();
app.use(secureHeaders());
app.use(bodyLimit({ maxSize: 1024 * 1024 }));
app.get("/health", (context) => context.json({ status: "ok" }));
app.on(["GET", "POST"], "/api/auth/*", (context) => auth.handler(context.req.raw));

const handler = new RPCHandler(router);
app.use("/api/rpc/*", async (context, next) => {
  const origin = context.req.header("origin");
  if (origin && origin !== new URL(env.APP_URL).origin) {
    return context.json({ message: "Origine non autorisée." }, 403);
  }
  const { matched, response } = await handler.handle(context.req.raw, {
    prefix: "/api/rpc",
    context: { headers: context.req.raw.headers },
  });
  if (matched) return context.newResponse(response.body, response);
  await next();
});

app.onError((error, context) => {
  console.error("Erreur API", error);
  return context.json({ message: "Une erreur est survenue." }, 500);
});
