import type { NextConfig } from "next";

// cacheComponents is off on purpose: nearly every page reads the session or the
// language cookie and must show server-confirmed state (DECISIONS.md D-30).
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
