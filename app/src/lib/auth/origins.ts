/**
 * Origins Better Auth accepts besides APP_URL (DECISIONS.md D-57).
 *
 * Better Auth rejects a POST whose Origin is not trusted (INVALID_ORIGIN) once the browser
 * holds a session cookie. Locally the app is reached as `localhost`, `127.0.0.1` or a LAN
 * address (testing on a phone), so development trusts those on the app's own port. Production
 * trusts APP_URL only.
 */
export function trustedOriginsFor(appUrl: string, isProduction: boolean): string[] {
  if (isProduction) return [appUrl];
  const { protocol, port } = new URL(appUrl);
  const suffix = port ? `:${port}` : "";
  const hosts = ["localhost", "127.0.0.1", "[::1]", "192.168.*.*", "10.*.*.*", "172.*.*.*"];
  return [appUrl, ...hosts.map((h) => `${protocol}//${h}${suffix}`)];
}

/** Hostnames (no scheme, no port) the Next.js dev server may serve assets to. */
export const DEV_ALLOWED_HOSTS = ["127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"];
