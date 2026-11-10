import postgres from "postgres";
import { runMigrations } from "@/lib/db/migrate";
import { testDatabaseUrl } from "./test-db";

/** Drop and recreate the test database, then apply every migration (incl. hand-written constraints). */
export default async function setup() {
  const url = testDatabaseUrl();
  const name = new URL(url).pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await sql.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await sql.end();
  }
  await runMigrations(url);
}
