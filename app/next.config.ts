import type { NextConfig } from "next";
import { DEV_ALLOWED_HOSTS } from "./src/lib/auth/origins";

// cacheComponents is off on purpose: nearly every page reads the session or the
// language cookie and must show server-confirmed state (DECISIONS.md D-30).
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Dev only (DECISIONS.md D-57): without this, opening the dev server as 127.0.0.1 or a LAN
  // address 403s its JS chunks, the page never hydrates and every sign-in button is dead.
  allowedDevOrigins: DEV_ALLOWED_HOSTS,
  serverExternalPackages: ["postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
