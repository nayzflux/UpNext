import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env";
import * as schema from "./schema";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 2000,
});
// Idle connections can disappear during a database restart. pg emits this
// outside a query; handling it lets the API keep reporting health 503.
pool.on("error", () => {
  console.error("Une connexion PostgreSQL inactive a été interrompue.");
});
export const db = drizzle(pool, { schema });
export type Connection = Pick<
  typeof db,
  "select" | "insert" | "update" | "delete" | "execute"
>;
