"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n/client";

export type MapPin = { id: string; label: string; lat: number; lng: number };

/**
 * Approximate pins (rounded to ~500 m server-side) and the search-radius ring on OpenStreetMap
 * tiles. Loaded lazily by ResultsView; the list works without it (cut line, docs/03).
 */
export default function CandidateMap({
  center,
  radiusKm,
  pins,
  onPick,
}: {
  center: { lat: number; lng: number };
  radiusKm: number;
  pins: MapPin[];
  onPick: (id: string) => void;
}) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !host.current) return;
      const map = L.map(host.current, { scrollWheelZoom: false }).setView(
        [center.lat, center.lng],
        12,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const ring = L.circle([center.lat, center.lng], {
        radius: radiusKm * 1000,
        color: "#0f766e",
        weight: 2,
        fillOpacity: 0.05,
      }).addTo(map);
      L.marker([center.lat, center.lng], {
        title: t("results.yourPlace"),
        icon: L.divIcon({ className: "", html: "📍", iconSize: [24, 24] }),
      }).addTo(map);
      for (const p of pins) {
        L.marker([p.lat, p.lng], {
          title: p.label,
          icon: L.divIcon({
            className: "",
            html: `<span style="display:block;width:20px;height:20px;border-radius:50%;background:#0f766e;border:3px solid #fff;box-shadow:0 0 0 1px #0f766e"></span>`,
            iconSize: [20, 20],
          }),
        })
          .addTo(map)
          .on("click", () => onPick(p.id));
      }
      map.fitBounds(ring.getBounds());
      cleanup = () => map.remove();
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [center.lat, center.lng, radiusKm, pins, onPick, t]);

  return (
    <div
      ref={host}
      className="h-80 w-full overflow-hidden rounded-lg border border-border md:h-full md:min-h-96"
      data-testid="results-map"
      role="region"
      aria-label={t("results.map")}
    />
  );
}
