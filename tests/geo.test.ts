import { describe, expect, it } from 'vitest';
import { distanceM } from '../src/geo/haversine';
import { ZoneDetector } from '../src/geo/zone';
import { yandexRouteUrl } from '../src/geo/deeplink';

const target = { lat: 59.939, lon: 30.3158, radiusM: 150, maxAccuracyM: 100 };
const fix = (lat: number, lon: number, accuracy = 10) => ({ lat, lon, accuracy, at: Date.now() });

describe('distanceM', () => {
  it('matches a known distance (Palace Square → Kazan Cathedral ≈ 0.9 km)', () => {
    expect(distanceM(59.939, 30.3158, 59.9343, 30.3248)).toBeGreaterThan(700);
    expect(distanceM(59.939, 30.3158, 59.9343, 30.3248)).toBeLessThan(800);
  });
});

describe('ZoneDetector', () => {
  it('needs two consecutive good fixes inside the radius', () => {
    const zone = new ZoneDetector(target);
    expect(zone.push(fix(59.939, 30.3158))).toBe(false);
    expect(zone.push(fix(59.939, 30.3158))).toBe(true);
  });

  it('resets the streak on a fix outside the radius', () => {
    const zone = new ZoneDetector(target);
    zone.push(fix(59.939, 30.3158));
    expect(zone.push(fix(59.95, 30.3158))).toBe(false);
    expect(zone.push(fix(59.939, 30.3158))).toBe(false);
  });

  it('opens on a single inside fix that stays uncontradicted for the dwell time', () => {
    const zone = new ZoneDetector(target);
    zone.push(fix(59.939, 30.3158), 1000);
    expect(zone.dwellReached(3000)).toBe(false);
    expect(zone.dwellReached(4000)).toBe(true);
  });

  it('restarts the dwell timer after a fix outside', () => {
    const zone = new ZoneDetector(target);
    zone.push(fix(59.939, 30.3158), 1000);
    zone.push(fix(59.95, 30.3158), 2000);
    expect(zone.dwellReached(10_000)).toBe(false);
  });

  it('ignores fixes with poor accuracy even at the exact spot', () => {
    const zone = new ZoneDetector(target);
    zone.push(fix(59.939, 30.3158, 150));
    expect(zone.push(fix(59.939, 30.3158, 150))).toBe(false);
  });

  it('rejects a point just outside the radius', () => {
    const zone = new ZoneDetector(target);
    const lat = 59.939 + 160 / 111_195;
    zone.push(fix(lat, 30.3158));
    expect(zone.push(fix(lat, 30.3158))).toBe(false);
  });
});

it('builds Yandex Maps route deeplinks', () => {
  expect(yandexRouteUrl(59.9, 30.3, 'pd')).toBe('https://yandex.ru/maps/?rtext=~59.9,30.3&rtt=pd');
});
