import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://rr:rr@localhost:5433/roshan" },
  strict: true,
});
