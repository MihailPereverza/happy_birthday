export interface Slot {
  x: number;
  y: number;
  r: number;
}

/** Classic parametric heart; t = 0 is the dip between the lobes, t = π the bottom tip. */
const heartAt = (t: number) => ({
  x: 16 * Math.sin(t) ** 3,
  y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
});

const SAMPLES = 720;

/** Points evenly spaced by arc length along the heart, starting at the dip and going clockwise. */
function evenHeartPoints(count: number): { x: number; y: number }[] {
  const raw = Array.from({ length: SAMPLES + 1 }, (_, i) => heartAt((i / SAMPLES) * Math.PI * 2));
  const cumulative = [0];
  for (let i = 1; i < raw.length; i += 1) {
    cumulative.push(cumulative[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y));
  }
  const total = cumulative[cumulative.length - 1];
  let j = 0;
  return Array.from({ length: count }, (_, k) => {
    const target = (total * k) / count;
    while (j < cumulative.length - 1 && cumulative[j + 1] < target) j += 1;
    return raw[j];
  });
}

/** Heart outline polyline in box coordinates (for the drawn contour). */
export function heartOutline(size: number, scale = 1): { x: number; y: number }[] {
  const fit = fitter(size);
  return Array.from({ length: 241 }, (_, i) => fit(heartAt((i / 240) * Math.PI * 2), scale));
}

// Raw heart spans x ∈ [-16, 16], y ∈ [-12, 17]; centre it in a square box with room for the photo circles.
function fitter(size: number) {
  const k = (size * 0.78) / 32;
  const cx = size / 2;
  const cy = size / 2 - 2.5 * k;
  return (p: { x: number; y: number }, scale = 1) => ({ x: cx + p.x * k * scale, y: cy + p.y * k * scale });
}

export const MAX_PHOTOS = 20;

/** Picks up to MAX_PHOTOS items spread evenly over the list (e.g. over the day), keeping order. */
export function spreadPick<T>(items: T[], max = MAX_PHOTOS): T[] {
  if (items.length <= max) return items;
  return Array.from({ length: max }, (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))]);
}

/** Slots for `count` photos evenly along the heart outline; radii chosen so no two photos overlap. */
export function heartSlots(count: number, size: number): Slot[] {
  const n = Math.min(count, MAX_PHOTOS);
  if (n === 0) return [];
  const fit = fitter(size);
  const pts = evenHeartPoints(n).map((p) => fit(p));
  // Any pair counts, not just neighbours: across the dip of the heart two non-adjacent photos come close.
  let closest = size;
  pts.forEach((a, i) => pts.forEach((b, j) => i < j && (closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y)))));
  const r = Math.min(size * 0.085, closest * 0.47);
  return pts.map((p) => ({ ...p, r }));
}
