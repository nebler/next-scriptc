import { stores } from "./stores.ts";

type NearbyStore = { id: number; name: string; distanceMetres: number };
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const radiusKm = Number(params.get("radiusKm") ?? "50");
  if (!params.get("lat")?.trim() || !params.get("lng")?.trim() ||
      !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180 ||
      !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 20000) {
    return Response.json({ error: "lat/lng must be valid coordinates; radiusKm must be in (0, 20000]" }, { status: 400 });
  }
  const radians = Math.PI / 180;
  const originLat = lat * radians;
  const originLng = lng * radians;
  const nearby: NearbyStore[] = [];
  for (const store of stores) {
    const storeLat = store.lat * radians;
    const dlat = storeLat - originLat;
    const dlng = store.lng * radians - originLng;
    const h = Math.sin(dlat / 2) ** 2 + Math.cos(originLat) * Math.cos(storeLat) * Math.sin(dlng / 2) ** 2;
    const distance = 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
    if (distance <= radiusKm * 1000) {
      nearby.push({ id: store.id, name: store.name, distanceMetres: Math.round(distance) });
    }
  }
  nearby.sort((a, b) => a.distanceMetres - b.distanceMetres || a.id - b.id);
  return Response.json({ lat, lng, radiusKm, total: nearby.length, stores: nearby.slice(0, 20) }, {
    headers: { "cache-control": "no-store" },
  });
}
