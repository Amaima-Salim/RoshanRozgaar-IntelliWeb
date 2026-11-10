/** Geography helpers (docs/02 §6). Pure; shared by the server and the browser. */
export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371.0088;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km (Haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** One decimal place, as shown to customers ("2.1 km away"). */
export const roundKm = (km: number) => Math.round(km * 10) / 10;

/**
 * Public worker coordinates are snapped to a 0.005° grid (≈ 500 m) so a pin shows an area, never
 * a doorstep (docs/02 §6.5, BR-P8). The snap is deterministic, so a pin never jumps between loads.
 */
export const roundPublicCoord = (v: number) => Math.round(v / 0.005) * 0.005;
export const roundPublicPoint = (p: LatLng): LatLng => ({
  lat: Number(roundPublicCoord(p.lat).toFixed(3)),
  lng: Number(roundPublicCoord(p.lng).toFixed(3)),
});

/** Closest area to a point, or null when even the closest is farther than `maxKm`. */
export function nearestArea<A extends LatLng>(point: LatLng, areas: readonly A[], maxKm = 25) {
  let best: { area: A; km: number } | null = null;
  for (const area of areas) {
    const km = distanceKm(point, area);
    if (!best || km < best.km) best = { area, km };
  }
  return best && best.km <= maxKm ? best : null;
}
