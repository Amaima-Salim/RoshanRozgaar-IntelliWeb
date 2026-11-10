/**
 * The only auth entry points the app uses (docs/05 §2). Route and page code
 * never imports Better Auth directly.
 */
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { HttpError } from "@/lib/api/respond";
import { getAuth } from "./server";

export type Role = "worker" | "customer";

export type SessionUser = {
  id: string;
  name: string;
  nameUr: string | null;
  role: Role | null;
  language: "ur" | "en";
};

function toSessionUser(u: Record<string, unknown>): SessionUser {
  const role = u.role === "worker" || u.role === "customer" ? u.role : null;
  return {
    id: String(u.id),
    name: String(u.name ?? ""),
    nameUr: typeof u.nameUr === "string" ? u.nameUr : null,
    role,
    language: u.language === "en" ? "en" : "ur",
  };
}

/** Current user from the DB-backed session, or null. Cached per request. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const result = await getAuth().api.getSession({ headers: await headers() });
  return result ? toSessionUser(result.user as Record<string, unknown>) : null;
});

export const homeFor = (role: Role) => (role === "worker" ? "/w/home" : "/c/request/new");

/** For pages and layouts: redirect when the user can't be here (DECISIONS.md D-39). */
export async function requireRolePage(role: Role): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect(`/login?role=${role}`);
  if (!user.role) redirect("/");
  if (user.role !== role) redirect(homeFor(user.role));
  return user;
}

/** For route handlers: throws the error contract instead of redirecting. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new HttpError("UNAUTHENTICATED");
  return user;
}

export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== role) throw new HttpError("FORBIDDEN");
  return user;
}
