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

export const isFixInside = (fix: Fix, t: ZoneTarget): boolean =>
  fix.accuracy <= t.maxAccuracyM && distanceM(fix.lat, fix.lon, t.lat, t.lon) <= t.radiusM;

/** Entry needs two consecutive good fixes so a single GPS jump can't open the step. */
export class ZoneDetector {
  private streak = 0;

  constructor(private readonly target: ZoneTarget) {}

  push(fix: Fix): boolean {
    this.streak = isFixInside(fix, this.target) ? this.streak + 1 : 0;
    return this.streak >= REQUIRED_CONSECUTIVE_FIXES;
  }
}
