import { distanceM } from './haversine';

export interface Fix {
  lat: number;
  lon: number;
  accuracy: number;
  at: number;
}

export interface ZoneTarget {
  lat: number;
  lon: number;
  radiusM: number;
  maxAccuracyM: number;
}

export const REQUIRED_CONSECUTIVE_FIXES = 2;
/** A phone standing still may report one fix and then go quiet; an uncontradicted inside fix counts after this. */
export const INSIDE_DWELL_MS = 3000;

export const isFixInside = (fix: Fix, t: ZoneTarget): boolean =>
  fix.accuracy <= t.maxAccuracyM && distanceM(fix.lat, fix.lon, t.lat, t.lon) <= t.radiusM;

/**
 * Entry needs two consecutive good fixes inside, or one that no later fix contradicts for INSIDE_DWELL_MS,
 * so a single GPS jump can't open the step but a phone standing at the point always does.
 */
export class ZoneDetector {
  private streak = 0;
  private insideSince: number | null = null;

  constructor(private readonly target: ZoneTarget) {}

  push(fix: Fix, now = Date.now()): boolean {
    const inside = isFixInside(fix, this.target);
    this.streak = inside ? this.streak + 1 : 0;
    this.insideSince = inside ? (this.insideSince ?? now) : null;
    return this.streak >= REQUIRED_CONSECUTIVE_FIXES;
  }

  /** Called periodically between fixes. */
  dwellReached(now = Date.now()): boolean {
    return this.insideSince !== null && now - this.insideSince >= INSIDE_DWELL_MS;
  }
}
