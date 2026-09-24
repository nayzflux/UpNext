import { migrate } from "drizzle-orm/node-postgres/migrator";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "./index";

function migrationsFolder() {
  const folder = ["drizzle", "apps/api/drizzle"]
    .map((path) => resolve(process.cwd(), path))
    .find(existsSync);

  if (!folder) {
    throw new Error("Dossier de migrations Drizzle introuvable.");
  }

  return folder;
}

/** Apply every migration that has not yet been recorded by Drizzle. */
export async function applyMigrations() {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
