import { pool } from "./index";
import { applyMigrations } from "./run-migrations";

try {
  await applyMigrations();
  console.log("Migrations appliquées.");
} finally {
  await pool.end();
}
