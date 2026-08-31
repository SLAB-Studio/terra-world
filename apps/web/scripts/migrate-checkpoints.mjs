/* global URL, console, process */

import { readFile } from "node:fs/promises";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for checkpoint migrations");
}

const parsed = new URL(databaseUrl);
if (
  !["postgres:", "postgresql:"].includes(parsed.protocol) ||
  parsed.hostname.length === 0 ||
  parsed.pathname.length <= 1
) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection URL");
}

const migrationUrl = new URL(
  "../app/api/checkpoints/migrations/001_checkpoint_repositories.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  prepare: true,
});

try {
  await sql.begin(async (transaction) => {
    await transaction.unsafe(migration);
  });
  console.log("Checkpoint database migration 001 applied.");
} finally {
  await sql.end({ timeout: 5 });
}
