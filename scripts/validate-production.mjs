import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

mkdirSync(".artifacts", { recursive: true });
const envFile = ".artifacts/validation.env";
if (!existsSync(envFile)) {
  writeFileSync(
    envFile,
    [
      "APP_URL=https://localhost:3443",
      `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}`,
      "POSTGRES_USER=upnext",
      "POSTGRES_PASSWORD=validation-only-postgres-password",
      "POSTGRES_DB=upnext_validation",
      "DATABASE_URL_DOCKER=postgres://upnext:validation-only-postgres-password@postgres:5432/upnext_validation",
      "WEB_BIND_ADDRESS=127.0.0.1",
      "WEB_PORT=3100",
      "SMTP_HOST=mailpit",
      "SMTP_PORT=1025",
      "SMTP_SECURE=false",
      "SMTP_FROM=UpNext <bonjour@upnext.test>",
      "",
    ].join("\n"),
  );
}

const composeArgs = [
  "compose",
  "--env-file",
  envFile,
  "-p",
  "upnext-validation",
  "-f",
  "compose.production.yaml",
  "-f",
  "compose.validation.yaml",
];
function compose(...args) {
  return execFileSync("docker", [...composeArgs, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}
function sql(database, query) {
  return compose(
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "upnext",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    query,
  );
}
function healthStatus() {
  return Number(
    compose(
      "exec",
      "-T",
      "api",
      "node",
      "-e",
      "fetch('http://localhost:3001/health').then(async r => { console.log(r.status); if(r.headers.get('cache-control') !== 'no-store') process.exit(1); })",
    ),
  );
}
function checkEmptyAndExistingDatabase() {
  const database = `upnext_migrations_${Date.now()}`;
  sql("postgres", `create database ${database}`);
  function startApi() {
    compose(
      "run",
      "--rm",
      "-T",
      "--no-deps",
      "--entrypoint",
      "node",
      "-e",
      `DATABASE_URL=postgres://upnext:validation-only-postgres-password@postgres:5432/${database}`,
      "api",
      "-e",
      `
        import('./dist/index.js').catch(() => process.exit(1));
        setTimeout(async () => {
          try {
            const response = await fetch('http://localhost:3001/health');
            if (!response.ok) process.exit(1);
            process.kill(process.pid, 'SIGTERM');
          } catch {
            process.exit(1);
          }
        }, 5000);
      `,
    );
  }
  startApi();
  const migrationCount = sql(database, "select count(*) from drizzle.__drizzle_migrations");
  assert.equal(migrationCount, "6");
  // Recreate the previous schema in this scratch database, with an existing account.
  // The current release's only migration is additive: rate_limit.
  sql(
    database,
    `insert into public."user" (id, name, email) values ('migration-check', 'Validation', 'migration@upnext.test'); drop table rate_limit; delete from drizzle.__drizzle_migrations where created_at = (select max(created_at) from drizzle.__drizzle_migrations)`,
  );
  startApi();
  assert.equal(
    sql(database, "select count(*) from drizzle.__drizzle_migrations"),
    migrationCount,
  );
  assert.equal(
    sql(database, `select count(*) from public."user" where id = 'migration-check'`),
    "1",
  );
  assert.equal(sql(database, "select count(*) from rate_limit"), "0");
}
const countsQuery =
  'select (select count(*) from public."user"), (select count(*) from tasks), (select count(*) from study_sessions), (select count(*) from work_logs), (select count(*) from drizzle.__drizzle_migrations)';

try {
  console.log("Construction et démarrage de la pile de validation isolée.");
  compose("up", "--build", "-d", "--wait", "--wait-timeout", "180");
  assert.equal(healthStatus(), 200);
  console.log(
    "Démarrage sur base vide et migration de la version précédente avec données existantes.",
  );
  checkEmptyAndExistingDatabase();

  console.log("Parcours navigateur sur les images de production derrière HTTPS.");
  execFileSync("bun", ["run", "test:e2e", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_BASE_URL: "https://localhost:3443",
      E2E_MAILPIT_URL: "http://localhost:8026",
      E2E_EXTERNAL_SERVER: "true",
      E2E_HTTPS_IGNORE_ERRORS: "true",
    },
  });
  const before = sql("upnext_validation", countsQuery);
  assert.ok(
    Number(before.split("|")[0]) > 0,
    "La sauvegarde doit contenir des comptes de test.",
  );
  assert.ok(
    Number(before.split("|")[1]) > 0,
    "La sauvegarde doit contenir des tâches de test.",
  );
  assert.ok(Number(sql("upnext_validation", "select count(*) from rate_limit")) > 0);

  console.log("Sauvegarde et restauration dans une autre base de test.");
  compose(
    "exec",
    "-T",
    "postgres",
    "pg_dump",
    "-U",
    "upnext",
    "-d",
    "upnext_validation",
    "-Fc",
    "-f",
    "/tmp/upnext-validation.dump",
  );
  const restoreDatabase = `upnext_restore_${Date.now()}`;
  sql("postgres", `create database ${restoreDatabase}`);
  compose(
    "exec",
    "-T",
    "postgres",
    "pg_restore",
    "-U",
    "upnext",
    "-d",
    restoreDatabase,
    "--no-owner",
    "--exit-on-error",
    "/tmp/upnext-validation.dump",
  );
  assert.equal(sql(restoreDatabase, countsQuery), before);

  console.log("Arrêt propre, redémarrage et persistance des données et migrations.");
  const apiId = compose("ps", "-q", "api");
  compose("stop", "api", "web");
  const exitCode = execFileSync(
    "docker",
    ["inspect", "--format", "{{.State.ExitCode}}", apiId],
    { encoding: "utf8" },
  ).trim();
  assert.equal(exitCode, "0", "L'API doit terminer sans arrêt forcé.");
  compose("up", "-d", "--wait", "--wait-timeout", "120");
  assert.equal(sql("upnext_validation", countsQuery), before);

  console.log("Le contrôle de santé détecte une coupure de PostgreSQL puis récupère.");
  compose("stop", "postgres");
  assert.equal(healthStatus(), 503);
  compose("up", "-d", "--wait", "--wait-timeout", "120");
  assert.equal(healthStatus(), 200);
  assert.equal(sql("upnext_validation", countsQuery), before);
  writeFileSync(
    ".artifacts/production-validation.json",
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        browserTests: "passed",
        emptyDatabaseStartup: "passed",
        existingDatabaseMigration: "passed",
        backupRestore: "passed",
        restartPersistence: "passed",
        databaseOutageRecovery: "passed",
        counts: before,
      },
      null,
      2,
    ),
  );
  console.log("Validation de production réussie.");
} finally {
  // Only this disposable Compose project is stopped. Its volume is retained.
  compose("down");
}
