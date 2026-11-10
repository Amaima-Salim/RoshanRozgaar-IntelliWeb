import { Droplets, Snowflake, Wrench, Zap, Ruler } from "lucide-react";
import type { Trade } from "@/lib/domain/worker-profile";

/** Lucide stand-ins for the Figma trade icons (docs/11 §3). */
export const TRADE_ICONS: Record<Trade, typeof Zap> = {
  electrician: Zap,
  plumber: Droplets,
  ac_technician: Snowflake,
  carpenter: Ruler,
  mechanic: Wrench,
};
