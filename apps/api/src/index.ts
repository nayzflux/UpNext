import { serve } from "@hono/node-server";
import { app } from "./app";
import { env } from "./env";
import { pool } from "./db";

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`UpNext API : http://localhost:${info.port}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () =>
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    }),
  );
}
