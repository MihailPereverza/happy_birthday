export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Projected {
  x: number;
  y: number;
}

/** Equirectangular projection: x = (lon − lonMin)·cos(latCenter)·k, y = (latMax − lat)·k, k fits the box. */
export function project<T extends GeoPoint>(points: T[], width: number, height: number, padding = 24): (T & Projected)[] {
  if (!points.length) return [];
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lonMin = Math.min(...lons);
  const cosLat = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
  const spanX = (Math.max(...lons) - lonMin) * cosLat;
  const spanY = latMax - latMin;
  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const k = Math.min(spanX ? innerW / spanX : Infinity, spanY ? innerH / spanY : Infinity);
  const scale = Number.isFinite(k) ? k : 0;
  const offsetX = padding + (innerW - spanX * scale) / 2;
  const offsetY = padding + (innerH - spanY * scale) / 2;
  return points.map((p) => ({
    ...p,
    x: offsetX + (p.lon - lonMin) * cosLat * scale,
    y: offsetY + (latMax - p.lat) * scale,
  }));
}
