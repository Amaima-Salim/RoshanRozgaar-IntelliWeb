import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getConfig } from "@/lib/config";
import * as schema from "./schema";

/**
 * postgres.js over a TCP (pooled) connection: real transactions, needed by the
 * booking and payment paths (docs/02 §4). Never swap this for an HTTP-only driver.
 */
export function createDb(url: string, options: { max?: number } = {}) {
  const sqlClient = postgres(url, {
    max: options.max ?? 10,
    // Neon's pooler (PgBouncer, transaction mode) can't use prepared statements.
    prepare: !url.includes("-pooler."),
    onnotice: () => {},
  });
  return { db: drizzle(sqlClient, { schema, casing: "snake_case" }), sql: sqlClient };
}

export type Db = ReturnType<typeof createDb>["db"];

// One pool per server process (survives Next dev hot reloads).
const globalForDb = globalThis as unknown as { __rrDb?: ReturnType<typeof createDb> };

function instance() {
  if (!globalForDb.__rrDb) {
    const url = getConfig().databaseUrl;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__rrDb = createDb(url);
  }
  return globalForDb.__rrDb;
}

/** Lazily connected so importing this module never opens a connection at build time. */
export const db = new Proxy({} as Db, {
  get: (_t, prop) => Reflect.get(instance().db, prop, instance().db),
});

export function getSqlClient() {
  return instance().sql;
}
