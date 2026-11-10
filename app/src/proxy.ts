import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: no session cookie → /login. The real role and
 * ownership checks run on the server in the /w and /c layouts and in every
 * route handler (DECISIONS.md D-39).
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("role", pathname.startsWith("/w") ? "worker" : "customer");
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/w/:path*", "/c/:path*"],
};
