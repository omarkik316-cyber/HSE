import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Polygon } from "geojson";

let cachedZones: FeatureCollection<Polygon> | null = null;

export async function loadZones(): Promise<FeatureCollection<Polygon>> {
  if (cachedZones) return cachedZones;
  const res = await fetch("/data/project_zones.geojson");
  const data = (await res.json()) as FeatureCollection<Polygon>;
  cachedZones = data;
  return data;
}

/**
 * Given a click location, find which project zone/phase polygon it falls inside.
 * Returns the zone name (e.g. "Phase 3 - E") or null if outside all known zones.
 */
export function detectZone(
  lng: number,
  lat: number,
  zones: FeatureCollection<Polygon>
): string | null {
  const point = turf.point([lng, lat]);

  // Prefer the smallest matching polygon (sub-zone) over a big outer "Boundary" polygon
  const matches: { name: string; area: number }[] = [];

  for (const feature of zones.features) {
    if (feature.geometry.type !== "Polygon") continue;
    try {
      if (turf.booleanPointInPolygon(point, feature as Feature<Polygon>)) {
        const name = feature.properties?.name ?? "Unknown zone";
        const area = turf.area(feature as Feature<Polygon>);
        matches.push({ name, area });
      }
    } catch {
      // skip malformed polygons rather than crash the app
      continue;
    }
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => a.area - b.area);
  return matches[0].name;
}
