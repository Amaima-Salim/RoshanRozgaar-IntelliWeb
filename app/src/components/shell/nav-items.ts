import { CalendarCheck, Hammer, MessageCircle, Search, UserRound } from "lucide-react";
import type { MessageKey } from "@/lib/i18n";

export type ShellRole = "worker" | "customer";

export type NavItem = { href: string; key: MessageKey; Icon: typeof Hammer };

/** Main sections per role (docs/03 §2). */
export const NAV_ITEMS: Record<ShellRole, NavItem[]> = {
  worker: [
    { href: "/w/home", key: "nav.work", Icon: Hammer },
    { href: "/w/chat", key: "nav.messages", Icon: MessageCircle },
    { href: "/w/profile", key: "nav.profile", Icon: UserRound },
  ],
  customer: [
    { href: "/c/request/new", key: "nav.find", Icon: Search },
    { href: "/c/history", key: "nav.bookings", Icon: CalendarCheck },
    { href: "/c/chat", key: "nav.messages", Icon: MessageCircle },
  ],
};

export const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);
