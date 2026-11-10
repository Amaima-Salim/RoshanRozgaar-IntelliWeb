import postgres from "postgres";
import { loadEnvFiles } from "./load-env";
import { runMigrations } from "./migrate";

/** Drops every table and re-applies migrations. Demo/dev only (docs/03 §8). */
export async function resetDatabase(url: string) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(
      "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
    );
  } finally {
    await sql.end();
  }
  await runMigrations(url);
}

async function main() {
  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DB_RESET !== "1") {
    throw new Error("Refusing to reset in production without ALLOW_DB_RESET=1");
  }
  await resetDatabase(url);
  console.log("Database reset and migrated.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
