import { loadEnvFiles } from "@/lib/db/load-env";

/** The throwaway integration database (never the dev/demo one). */
export function testDatabaseUrl(): string {
  loadEnvFiles();
  const url = process.env.TEST_DATABASE_URL ?? "postgres://rr:rr@localhost:5433/roshan_test";
  if (url === process.env.DATABASE_URL)
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  if (!/test/i.test(new URL(url).pathname))
    throw new Error("TEST_DATABASE_URL's database name must contain 'test'");
  return url;
}
