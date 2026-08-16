import * as turf from "@turf/turf";
import { loadZones } from "./zoneDetect";

// Same two tile servers MapView uses — satellite imagery and the
// reference-label overlay (roads/place names) drawn on top of it.
const TILE_URL_TEMPLATES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
];

// z18 already resolves individual buildings; z19+ multiplies the tile
// count ~4x for detail that isn't needed to confirm which structure an
// observation pin sits on, so the range stops at 18 to keep the download
// a reasonable size for a phone on a site with patchy signal.
const MIN_ZOOM = 13;
const MAX_ZOOM = 18;

interface TileCoord {
  z: number;
  x: number;
  y: number;
}

function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

async function getProjectBounds(): Promise<[number, number, number, number]> {
  const zones = await loadZones();
  const [minLon, minLat, maxLon, maxLat] = turf.bbox(zones);
  // 15% margin so the cached area extends a bit past the drawn zone
  // boundaries — enough to pan around the edges without hitting blanks.
  const padLon = (maxLon - minLon) * 0.15;
  const padLat = (maxLat - minLat) * 0.15;
  return [minLon - padLon, minLat - padLat, maxLon + padLon, maxLat + padLat];
}

async function computeTileList(): Promise<TileCoord[]> {
  const [minLon, minLat, maxLon, maxLat] = await getProjectBounds();
  const tiles: TileCoord[] = [];
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const topLeft = lonLatToTile(minLon, maxLat, z);
    const bottomRight = lonLatToTile(maxLon, minLat, z);
    for (let x = Math.min(topLeft.x, bottomRight.x); x <= Math.max(topLeft.x, bottomRight.x); x++) {
      for (let y = Math.min(topLeft.y, bottomRight.y); y <= Math.max(topLeft.y, bottomRight.y); y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

export interface OfflineDownloadProgress {
  done: number;
  total: number;
  failed: number;
}

/** Rough estimate shown before the user commits to the download. */
export async function estimateOfflineDownload(): Promise<{ tileCount: number; approxMB: number }> {
  const tiles = await computeTileList();
  const tileCount = tiles.length * TILE_URL_TEMPLATES.length;
  // ~20KB/tile average for the imagery layer, ~8KB for the mostly-sparse
  // label overlay — a ballpark, not a promise, since tile weight varies
  // with how built-up each area is.
  const approxMB = Math.round(((tiles.length * 20 + tiles.length * 8) / 1024) * 10) / 10;
  return { tileCount, approxMB };
}

/**
 * Fetches every tile in the project area so the service worker's CacheFirst
 * "map-tiles" cache is fully warmed. A plain fetch() is enough — no need
 * to touch the Cache API directly, since the SW intercepts these requests
 * and caches the response itself.
 */
export async function downloadOfflineMap(
  onProgress: (progress: OfflineDownloadProgress) => void,
  signal?: AbortSignal
): Promise<OfflineDownloadProgress> {
  const tiles = await computeTileList();
  const urls: string[] = [];
  for (const t of tiles) {
    for (const template of TILE_URL_TEMPLATES) {
      urls.push(template.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y)));
    }
  }

  const total = urls.length;
  let done = 0;
  let failed = 0;
  const CONCURRENCY = 8;

  async function worker() {
    while (urls.length > 0) {
      if (signal?.aborted) return;
      const url = urls.pop();
      if (!url) return;
      try {
        const res = await fetch(url, { signal });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
      done++;
      onProgress({ done, total, failed });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return { done, total, failed };
}

export async function getOfflineCacheInfo(): Promise<{ tileCount: number } | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open("map-tiles");
    const keys = await cache.keys();
    return { tileCount: keys.length };
  } catch {
    return null;
  }
}

export async function clearOfflineMap(): Promise<void> {
  if (typeof caches === "undefined") return;
  await caches.delete("map-tiles");
}
